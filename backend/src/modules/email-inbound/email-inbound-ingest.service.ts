import { Injectable, Logger } from '@nestjs/common';
import { PreTicketStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { FileStorageService } from '../../common/storage/file-storage.service';
import { QueueService } from '../../common/redis/queue.service';
import { TicketAutomationService } from '../tickets/ticket-automation.service';
import {
  MicrosoftGraphMailClient,
  type GraphMailMessage,
} from './microsoft-graph-mail.client';

@Injectable()
export class EmailInboundIngestService {
  private readonly logger = new Logger(EmailInboundIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: MicrosoftGraphMailClient,
    private readonly files: FileStorageService,
    private readonly queue: QueueService,
    private readonly ticketAutomation: TicketAutomationService,
  ) {}

  async getOrCreateSettings() {
    return this.prisma.emailInboundSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', updatedAt: new Date() },
      update: {},
    });
  }

  async pollMailbox(): Promise<{ scanned: number; created: number }> {
    const settings = await this.getOrCreateSettings();
    if (!settings.enabled || !settings.sharedMailboxAddress) {
      return { scanned: 0, created: 0 };
    }
    if (
      !this.graph.isConfigured({
        tenantId: settings.graphTenantId,
        clientId: settings.graphClientId,
      })
    ) {
      this.logger.warn('Poll e-mail: Graph não configurado');
      return { scanned: 0, created: 0 };
    }

    const messages = await this.graph.listRecentMessages({
      mailbox: settings.sharedMailboxAddress,
      top: 40,
      tenantId: settings.graphTenantId,
      clientId: settings.graphClientId,
    });

    let created = 0;
    for (const msg of messages) {
      const messageId = msg.internetMessageId?.trim() || `graph:${msg.id}`;
      const existing = await this.prisma.preTicket.findUnique({
        where: { messageId },
        select: { id: true },
      });
      if (existing) continue;

      const fromEmail =
        msg.from?.emailAddress?.address?.trim().toLowerCase() ?? '';
      if (fromEmail && isSenderBlocked(fromEmail, settings.blockedSenders)) {
        const toEmails = [
          ...(msg.toRecipients ?? []),
          ...(msg.ccRecipients ?? []),
        ]
          .map((r) => r.emailAddress?.address?.trim().toLowerCase())
          .filter((v): v is string => Boolean(v));
        await this.recordIgnoredMessage({
          messageId,
          graphMessageId: msg.id,
          fromEmail,
          fromName: msg.from?.emailAddress?.name?.trim() || null,
          toEmails,
          mailbox: settings.sharedMailboxAddress,
          title:
            msg.subject?.trim() || msg.bodyPreview?.trim() || '(sem assunto)',
          receivedAt: msg.receivedDateTime
            ? new Date(msg.receivedDateTime)
            : new Date(),
        });
        continue;
      }

      const enqueued = await this.queue.enqueueEmailInbound({
        mailboxAddress: settings.sharedMailboxAddress,
        messageId,
        graphMessageId: msg.id,
      });
      if (!enqueued.queued) {
        const ok = await this.createPreTicketFromMessage({
          settings,
          message: msg,
          messageId,
        });
        if (ok) created += 1;
      } else {
        created += 1;
      }
    }

    await this.prisma.emailInboundSettings.update({
      where: { id: 'default' },
      data: { lastPolledAt: new Date() },
    });

    return { scanned: messages.length, created };
  }

  async ingestGraphMessage(data: {
    mailboxAddress: string;
    messageId: string;
    graphMessageId: string;
  }) {
    const existing = await this.prisma.preTicket.findUnique({
      where: { messageId: data.messageId },
      select: { id: true },
    });
    if (existing) return;

    const settings = await this.getOrCreateSettings();
    const message = await this.graph.getMessage({
      mailbox: data.mailboxAddress,
      graphMessageId: data.graphMessageId,
      tenantId: settings.graphTenantId,
      clientId: settings.graphClientId,
    });
    await this.createPreTicketFromMessage({
      settings,
      message,
      messageId: data.messageId,
    });
  }

  private async createPreTicketFromMessage(params: {
    settings: {
      sharedMailboxAddress: string | null;
      graphTenantId: string | null;
      graphClientId: string | null;
      blockedSenders?: string | null;
    };
    message: GraphMailMessage;
    messageId: string;
  }): Promise<boolean> {
    const fromEmail =
      params.message.from?.emailAddress?.address?.trim().toLowerCase() ?? '';
    if (!fromEmail) return false;

    const fromName = params.message.from?.emailAddress?.name?.trim() || null;
    const toEmails = [
      ...(params.message.toRecipients ?? []),
      ...(params.message.ccRecipients ?? []),
    ]
      .map((r) => r.emailAddress?.address?.trim().toLowerCase())
      .filter((v): v is string => Boolean(v));

    const title =
      params.message.subject?.trim() ||
      params.message.bodyPreview?.trim() ||
      '(sem assunto)';

    const mailbox =
      params.settings.sharedMailboxAddress ?? toEmails[0] ?? 'unknown';

    // Remetente bloqueado: grava IGNORED com messageId para não reprocessar (sem virar pré-ticket).
    if (isSenderBlocked(fromEmail, params.settings.blockedSenders)) {
      await this.recordIgnoredMessage({
        messageId: params.messageId,
        graphMessageId: params.message.id,
        fromEmail,
        fromName,
        toEmails,
        mailbox,
        title,
        receivedAt: params.message.receivedDateTime
          ? new Date(params.message.receivedDateTime)
          : new Date(),
      });
      this.logger.log(
        `E-mail ignorado (remetente bloqueado): ${fromEmail} (${params.messageId})`,
      );
      return false;
    }

    const contentType = params.message.body?.contentType?.toLowerCase();
    const bodyContent = params.message.body?.content ?? '';
    const descriptionHtml = contentType === 'html' ? bodyContent : null;
    const descriptionText =
      contentType === 'text'
        ? bodyContent
        : (params.message.bodyPreview ?? stripHtml(bodyContent));

    const conversationId = params.message.conversationId?.trim() || null;
    const headers = params.message.internetMessageHeaders ?? [];
    const headerValue = (name: string) =>
      headers
        .find((h) => h.name?.toLowerCase() === name.toLowerCase())
        ?.value?.trim() || null;
    const inReplyTo = headerValue('In-Reply-To');
    const referencesHeader = headerValue('References');

    const requestor = await this.prisma.user.findFirst({
      where: {
        email: { equals: fromEmail, mode: 'insensitive' },
        deletedAt: null,
      },
      select: { id: true, companyId: true, name: true },
    });

    const route = await this.matchRoute(fromEmail);
    const companyId = route?.companyId ?? requestor?.companyId ?? null;
    const specialtyId = route?.specialtyId ?? null;
    const priorityName = route?.priorityName ?? null;

    const systemUploader =
      (
        await this.prisma.user.findFirst({
          where: { role: 'ADMIN', deletedAt: null, status: 'ACTIVE' },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        })
      )?.id ?? requestor?.id;

    if (!systemUploader) {
      this.logger.warn('Sem usuário para gravar anexos do pré-ticket');
    }

    const matchedTicketNumber = await this.resolveLinkedTicketNumber({
      subject: title,
      bodyText: descriptionText,
      conversationId,
      inReplyTo,
      referencesHeader,
    });

    const linkedTicketNumber: number | null = matchedTicketNumber;
    let appliedToTicket = false;
    let status: PreTicketStatus = PreTicketStatus.PENDING;

    if (matchedTicketNumber != null) {
      const ticket = await this.prisma.portalTicket.findUnique({
        where: { ticketNumber: matchedTicketNumber },
        select: {
          ticketNumber: true,
          isClosed: true,
          emailConversationId: true,
        },
      });
      if (ticket && !ticket.isClosed) {
        appliedToTicket = true;
        status = PreTicketStatus.OPENED;
      }
      // fechado: permanece PENDING com linkedTicketNumber para o operador
    }

    const normalizedSubject = normalizeEmailSubject(title);
    let possibleDuplicateSubject = false;
    if (!matchedTicketNumber && companyId && normalizedSubject) {
      const dup = await this.prisma.preTicket.findFirst({
        where: {
          status: PreTicketStatus.PENDING,
          companyId,
          deletedAt: null,
          appliedToTicket: false,
          receivedAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
          title: { equals: title, mode: 'insensitive' },
        },
        select: { id: true },
      });
      possibleDuplicateSubject = Boolean(dup);
    }

    let preTicket;
    try {
      preTicket = await this.prisma.preTicket.create({
        data: {
          id: randomUUID(),
          status,
          title: title.slice(0, 500),
          descriptionHtml,
          descriptionText,
          fromName: fromName ?? requestor?.name ?? fromEmail,
          fromEmail,
          toEmails: toEmails.length ? toEmails : [mailbox],
          mailboxAddress: mailbox,
          messageId: params.messageId,
          graphMessageId: params.message.id,
          conversationId,
          inReplyTo,
          referencesHeader,
          possibleDuplicateSubject,
          linkedTicketNumber,
          appliedToTicket,
          companyId,
          requestorUserId: requestor?.id ?? null,
          specialtyId,
          priorityName,
          ticketNumber: appliedToTicket ? linkedTicketNumber : null,
          openedAt: appliedToTicket ? new Date() : null,
          receivedAt: params.message.receivedDateTime
            ? new Date(params.message.receivedDateTime)
            : new Date(),
        },
      });
    } catch (err) {
      // Duplicado por corrida no messageId único — não cria de novo.
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code?: string }).code === 'P2002'
      ) {
        return false;
      }
      throw err;
    }

    let attachmentCount = 0;
    let html = descriptionHtml;
    const imageDataUrls: string[] = [];
    // Inline (cid:) muitas vezes não marca hasAttachments=true no Graph — sempre tenta listar.
    if (systemUploader) {
      try {
        const metas = await this.graph.listAttachmentsMeta({
          mailbox,
          graphMessageId: params.message.id,
          tenantId: params.settings.graphTenantId,
          clientId: params.settings.graphClientId,
        });
        for (const meta of metas.slice(0, 20)) {
          const file = await this.graph.downloadAttachment({
            mailbox,
            graphMessageId: params.message.id,
            attachmentId: meta.id,
            tenantId: params.settings.graphTenantId,
            clientId: params.settings.graphClientId,
          });
          const contentType =
            file.contentType || meta.contentType || 'application/octet-stream';
          const key = `pre-tickets/${preTicket.id}/${randomUUID()}-${file.name}`;
          const stored = await this.files.saveBuffer(key, file.contentBytes);
          const dbFile = await this.prisma.file.create({
            data: {
              id: randomUUID(),
              originalName: file.name,
              mimeType: contentType,
              path: stored.storagePath,
              size: file.contentBytes.length,
              uploadedBy: systemUploader,
            },
          });
          await this.prisma.preTicketAttachment.create({
            data: {
              id: randomUUID(),
              preTicketId: preTicket.id,
              fileId: dbFile.id,
              fileName: file.name,
              contentType,
              sizeBytes: file.contentBytes.length,
            },
          });
          attachmentCount += 1;

          const isImage =
            contentType.toLowerCase().startsWith('image/') &&
            file.contentBytes.length > 0 &&
            file.contentBytes.length <= 4_000_000;
          const dataUrl = isImage
            ? `data:${contentType};base64,${file.contentBytes.toString('base64')}`
            : null;
          if (dataUrl) imageDataUrls.push(dataUrl);

          const cidRaw = (meta.contentId ?? file.contentId)?.trim();
          if (html && cidRaw && dataUrl) {
            const cid = cidRaw.replace(/^<|>$/g, '');
            html = rewriteCidReferences(html, cid, dataUrl);
          }
        }
        if (html) {
          html = rewriteRemainingCidsByOrder(html, imageDataUrls);
        }
      } catch (err) {
        this.logger.warn(
          `Anexos pré-ticket ${preTicket.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (attachmentCount > 0 || (html && html !== descriptionHtml)) {
      await this.prisma.preTicket.update({
        where: { id: preTicket.id },
        data: {
          ...(attachmentCount > 0 ? { attachmentCount } : {}),
          ...(html && html !== descriptionHtml
            ? { descriptionHtml: html }
            : {}),
        },
      });
    }

    if (appliedToTicket && linkedTicketNumber != null) {
      await this.applyEmailToOpenTicket({
        ticketNumber: linkedTicketNumber,
        fromName: fromName ?? fromEmail,
        fromEmail,
        title,
        html: html ?? descriptionHtml,
        text: descriptionText,
        conversationId,
        preTicketId: preTicket.id,
        systemUploaderId: systemUploader ?? null,
      });
      this.logger.log(
        `E-mail aplicado ao chamado #${linkedTicketNumber} (${params.messageId})`,
      );
      return true;
    }

    this.logger.log(
      `Pré-ticket criado ${preTicket.id} de ${fromEmail} (${params.messageId})` +
        (linkedTicketNumber
          ? ` → resposta a #${linkedTicketNumber} (fechado)`
          : '') +
        (possibleDuplicateSubject ? ' [assunto duplicado]' : ''),
    );
    return true;
  }

  private async resolveLinkedTicketNumber(params: {
    subject: string;
    bodyText: string;
    conversationId: string | null;
    inReplyTo: string | null;
    referencesHeader: string | null;
  }): Promise<number | null> {
    const fromHash = extractTicketNumberFromText(
      `${params.subject}\n${params.bodyText}`,
    );
    if (fromHash != null) {
      const exists = await this.prisma.portalTicket.findUnique({
        where: { ticketNumber: fromHash },
        select: { ticketNumber: true },
      });
      if (exists) return fromHash;
    }

    if (params.conversationId) {
      const byConv = await this.prisma.portalTicket.findFirst({
        where: { emailConversationId: params.conversationId },
        select: { ticketNumber: true },
        orderBy: { updatedAt: 'desc' },
      });
      if (byConv) return byConv.ticketNumber;
    }

    const refIds = [
      params.inReplyTo,
      ...(params.referencesHeader?.split(/\s+/) ?? []),
    ]
      .map((v) => v?.trim())
      .filter((v): v is string => Boolean(v));

    for (const mid of refIds.slice(0, 12)) {
      const prev = await this.prisma.preTicket.findFirst({
        where: { messageId: mid },
        select: {
          ticketNumber: true,
          linkedTicketNumber: true,
        },
      });
      const n = prev?.ticketNumber ?? prev?.linkedTicketNumber;
      if (n != null) return n;
    }

    return null;
  }

  private async applyEmailToOpenTicket(params: {
    ticketNumber: number;
    fromName: string;
    fromEmail: string;
    title: string;
    html: string | null;
    text: string;
    conversationId: string | null;
    preTicketId: string;
    systemUploaderId: string | null;
  }) {
    const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const blockHtml = [
      `<hr/>`,
      `<p><strong>Resposta por e-mail</strong> — ${escapeHtml(params.fromName)} &lt;${escapeHtml(params.fromEmail)}&gt; · ${stamp}</p>`,
      `<p><em>${escapeHtml(params.title)}</em></p>`,
      params.html?.trim() ||
        `<pre>${escapeHtml(params.text || '(sem conteúdo)')}</pre>`,
    ].join('\n');

    const existing = await this.prisma.portalTicketDescription.findUnique({
      where: { ticketNumber: params.ticketNumber },
      select: { description: true },
    });
    const nextDescription = existing?.description?.trim()
      ? `${existing.description}\n${blockHtml}`
      : blockHtml;

    const uploader = params.systemUploaderId;
    if (!uploader) {
      this.logger.warn(
        `Sem uploader para aplicar e-mail ao ticket #${params.ticketNumber}`,
      );
      return;
    }

    await this.prisma.portalTicketDescription.upsert({
      where: { ticketNumber: params.ticketNumber },
      create: {
        ticketNumber: params.ticketNumber,
        description: nextDescription,
        createdBy: uploader,
      },
      update: { description: nextDescription },
    });

    if (params.conversationId) {
      await this.prisma.portalTicket.update({
        where: { ticketNumber: params.ticketNumber },
        data: {
          emailConversationId: params.conversationId,
          updatedAtSource: new Date(),
        },
      });
    }

    const preAttachments = await this.prisma.preTicketAttachment.findMany({
      where: { preTicketId: params.preTicketId },
    });
    for (const att of preAttachments) {
      try {
        await this.prisma.portalTicketAppointmentAttachment.create({
          data: {
            id: randomUUID(),
            ticketNumber: params.ticketNumber,
            portalAppointmentId: null,
            fileId: att.fileId,
            createdBy: uploader,
          },
        });
      } catch {
        /* ignore duplicates */
      }
    }

    try {
      await this.prisma.ticketHistory.create({
        data: {
          id: randomUUID(),
          ticketNumber: params.ticketNumber,
          eventType: 'EMAIL_REPLY',
          summary: `Resposta por e-mail de ${params.fromEmail}: ${params.title.slice(0, 160)}`,
          actorName: params.fromName,
          source: 'PORTAL',
          occurredAt: new Date(),
          externalKey: `email:${params.preTicketId}`,
        },
      });
    } catch {
      /* ignore */
    }

    void this.ticketAutomation
      .dispatchNewReplyForUser(uploader, params.ticketNumber)
      .catch((err) =>
        this.logger.warn(
          `Automações TICKET_NEW_REPLY (e-mail) falharam #${params.ticketNumber}: ${
            err instanceof Error ? err.message : err
          }`,
        ),
      );
  }

  /**
   * Corrige HTML com cid: em pré-tickets já gravados (imagem quebrada na UI).
   * Rebaixa anexos do Graph e embute imagens inline como data URL.
   */
  async repairInlineImagesIfNeeded(preTicketId: string): Promise<boolean> {
    const row = await this.prisma.preTicket.findFirst({
      where: { id: preTicketId, deletedAt: null },
      include: { attachments: true },
    });
    if (!row?.graphMessageId || !row.descriptionHtml?.includes('cid:')) {
      return false;
    }

    const settings = await this.getOrCreateSettings();
    if (
      !this.graph.isConfigured({
        tenantId: settings.graphTenantId,
        clientId: settings.graphClientId,
      })
    ) {
      return false;
    }

    const mailbox = row.mailboxAddress;
    let html = row.descriptionHtml;
    let attachmentCount = row.attachmentCount;
    const imageDataUrls: string[] = [];
    const systemUploader =
      (
        await this.prisma.user.findFirst({
          where: { role: 'ADMIN', deletedAt: null },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        })
      )?.id ?? null;

    try {
      const metas = await this.graph.listAttachmentsMeta({
        mailbox,
        graphMessageId: row.graphMessageId,
        tenantId: settings.graphTenantId,
        clientId: settings.graphClientId,
      });
      for (const meta of metas.slice(0, 20)) {
        const file = await this.graph.downloadAttachment({
          mailbox,
          graphMessageId: row.graphMessageId,
          attachmentId: meta.id,
          tenantId: settings.graphTenantId,
          clientId: settings.graphClientId,
        });
        const contentType =
          file.contentType || meta.contentType || 'application/octet-stream';

        if (row.attachments.length === 0 && systemUploader) {
          const key = `pre-tickets/${row.id}/${randomUUID()}-${file.name}`;
          const stored = await this.files.saveBuffer(key, file.contentBytes);
          const dbFile = await this.prisma.file.create({
            data: {
              id: randomUUID(),
              originalName: file.name,
              mimeType: contentType,
              path: stored.storagePath,
              size: file.contentBytes.length,
              uploadedBy: systemUploader,
            },
          });
          await this.prisma.preTicketAttachment.create({
            data: {
              id: randomUUID(),
              preTicketId: row.id,
              fileId: dbFile.id,
              fileName: file.name,
              contentType,
              sizeBytes: file.contentBytes.length,
            },
          });
          attachmentCount += 1;
        }

        const isImage =
          contentType.toLowerCase().startsWith('image/') &&
          file.contentBytes.length > 0 &&
          file.contentBytes.length <= 4_000_000;
        const dataUrl = isImage
          ? `data:${contentType};base64,${file.contentBytes.toString('base64')}`
          : null;
        if (dataUrl) imageDataUrls.push(dataUrl);

        const cidRaw = (meta.contentId ?? file.contentId)?.trim();
        if (html && cidRaw && dataUrl) {
          const cid = cidRaw.replace(/^<|>$/g, '');
          html = rewriteCidReferences(html, cid, dataUrl);
        }
      }
      if (html) {
        html = rewriteRemainingCidsByOrder(html, imageDataUrls);
      }
    } catch (err) {
      this.logger.warn(
        `Repair anexos pré-ticket ${preTicketId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }

    if (
      html === row.descriptionHtml &&
      attachmentCount === row.attachmentCount
    ) {
      return false;
    }

    await this.prisma.preTicket.update({
      where: { id: row.id },
      data: {
        descriptionHtml: html,
        attachmentCount,
      },
    });
    return true;
  }

  private async recordIgnoredMessage(params: {
    messageId: string;
    graphMessageId: string;
    fromEmail: string;
    fromName: string | null;
    toEmails: string[];
    mailbox: string;
    title: string;
    receivedAt: Date;
  }) {
    try {
      await this.prisma.preTicket.create({
        data: {
          id: randomUUID(),
          status: PreTicketStatus.IGNORED,
          title: `[ignorado] ${params.title}`.slice(0, 500),
          descriptionText:
            'Remetente bloqueado nas configurações de e-mail — não vira pré-ticket.',
          fromName: params.fromName,
          fromEmail: params.fromEmail,
          toEmails: params.toEmails.length ? params.toEmails : [params.mailbox],
          mailboxAddress: params.mailbox,
          messageId: params.messageId,
          graphMessageId: params.graphMessageId,
          receivedAt: params.receivedAt,
        },
      });
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code?: string }).code === 'P2002'
      ) {
        return;
      }
      throw err;
    }
  }

  private async matchRoute(fromEmail: string) {
    const routes = await this.prisma.emailInboundRoute.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    const exact = routes.find(
      (r) => r.matchEmail.trim().toLowerCase() === fromEmail,
    );
    if (exact) return exact;
    const domain = fromEmail.includes('@') ? fromEmail.split('@')[1] : null;
    if (domain) {
      return (
        routes.find((r) => {
          const m = r.matchEmail.trim().toLowerCase();
          return m === `*@${domain}` || m === `@${domain}`;
        }) ?? null
      );
    }
    return null;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20_000);
}

/** Um por linha (ou vírgula): email@x.com, *@dominio.com, @dominio.com */
export function parseBlockedSenders(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(/[\n,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isSenderBlocked(
  fromEmail: string,
  blockedRaw: string | null | undefined,
): boolean {
  const email = fromEmail.trim().toLowerCase();
  if (!email) return false;
  const domain = email.includes('@') ? (email.split('@').pop() ?? '') : '';
  for (const pattern of parseBlockedSenders(blockedRaw)) {
    if (pattern.startsWith('*@') || pattern.startsWith('@')) {
      const blockedDomain = pattern.replace(/^\*?@/, '');
      if (blockedDomain && domain === blockedDomain) return true;
      continue;
    }
    if (pattern.includes('@')) {
      if (email === pattern) return true;
      continue;
    }
    if (domain && domain === pattern) return true;
  }
  return false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Substitui referências cid: do Outlook por data URL (img embutida). */
function rewriteCidReferences(
  html: string,
  contentId: string,
  dataUrl: string,
): string {
  const cid = contentId.trim();
  if (!cid) return html;
  const patterns = [
    new RegExp(`cid:${escapeRegExp(cid)}`, 'gi'),
    new RegExp(`cid:${escapeRegExp(`<${cid}>`)}`, 'gi'),
  ];
  let out = html;
  for (const re of patterns) {
    out = out.replace(re, dataUrl);
  }
  return out;
}

function extractCidRefs(html: string): string[] {
  const found = new Set<string>();
  const re = /(?:src|href)=["']cid:([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    found.add(match[1].replace(/^<|>$/g, '').trim());
  }
  return [...found].filter(Boolean);
}

/** Quando o Graph não devolve contentId, mapeia cid: restantes por ordem. */
function rewriteRemainingCidsByOrder(
  html: string,
  imageDataUrls: string[],
): string {
  if (!html.includes('cid:') || imageDataUrls.length === 0) return html;
  const cids = extractCidRefs(html);
  if (cids.length === 0) return html;
  let out = html;
  const n = Math.min(cids.length, imageDataUrls.length);
  for (let i = 0; i < n; i++) {
    out = rewriteCidReferences(out, cids[i], imageDataUrls[i]);
  }
  return out;
}

function extractTicketNumberFromText(text: string): number | null {
  const patterns = [
    /#\s*(\d{1,9})\b/,
    /\bchamado\s*[#:.-]?\s*(\d{1,9})\b/i,
    /\bticket\s*[#:.-]?\s*(\d{1,9})\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

function normalizeEmailSubject(subject: string): string {
  return subject
    .replace(/^(re|fw|fwd|enc|res)\s*:\s*/gi, '')
    .trim()
    .toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
