import { Injectable, Logger } from '@nestjs/common';
import { PreTicketStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { FileStorageService } from '../../common/storage/file-storage.service';
import { QueueService } from '../../common/redis/queue.service';
import { TicketAutomationService } from '../tickets/ticket-automation.service';
import { htmlParaTexto } from './html-para-texto';
import {
  createEmailReplyCommunication,
  isReopenableStage,
  reopenTicketFromEmail,
  senderCanReopenTicket,
  senderCanReplyToTicket,
} from './email-reply-communication';
import {
  MicrosoftGraphMailClient,
  PORTAL_SENT_HEADER,
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

    const ignoreBefore = emailInboundIgnoreBefore();

    let created = 0;
    for (const msg of messages) {
      // A leitura pega sempre os 40 mais recentes da caixa. Numa caixa que já
      // está em uso há anos (suporte@), ligar a integração transformaria
      // e-mails antigos, já atendidos, em pré-tickets novos. O corte deixa
      // entrar só o que chegou depois do momento em que a caixa foi ligada.
      if (
        ignoreBefore &&
        msg.receivedDateTime &&
        new Date(msg.receivedDateTime).getTime() < ignoreBefore.getTime()
      ) {
        continue;
      }
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
    // O corpo manda; a prévia é último recurso. O `bodyPreview` do Graph tem
    // no máximo 255 caracteres, então usá-lo primeiro cortava a descrição de
    // todo e-mail em HTML no meio da frase — foi o que aconteceu no #81743.
    const descriptionText =
      contentType === 'text'
        ? bodyContent
        : htmlParaTexto(bodyContent) || (params.message.bodyPreview ?? '');

    const headers = params.message.internetMessageHeaders ?? [];

    // Aviso de "não entregue" e resposta de ausência chegam aqui porque o
    // portal envia pela mesma caixa que lê. Com o chamado aberto, eles eram
    // colados na descrição como se fossem resposta do cliente.
    const automated = detectAutomatedMessage({
      fromEmail,
      subject: title,
      headers,
    });
    if (automated) {
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
        reason: AUTOMATED_MESSAGE_REASON[automated],
        detailText: descriptionText,
      });
      this.logger.log(
        `E-mail automático ignorado (${automated}): ${fromEmail} — ${title.slice(0, 120)}`,
      );
      return false;
    }

    const conversationId = params.message.conversationId?.trim() || null;
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
      select: { id: true, companyId: true, name: true, role: true },
    });

    const route = await this.matchRoute(fromEmail);
    const companyId =
      route?.companyId ??
      requestor?.companyId ??
      (await this.matchCompanyByDomain(fromEmail));
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
      conversationId,
      inReplyTo,
      referencesHeader,
    });

    const linkedTicketNumber: number | null = matchedTicketNumber;
    let appliedToTicket = false;
    let reopenTicket = false;
    let reopenFromStage: string | null = null;
    let status: PreTicketStatus = PreTicketStatus.PENDING;

    if (matchedTicketNumber != null) {
      const ticket = await this.prisma.portalTicket.findUnique({
        where: { ticketNumber: matchedTicketNumber },
        select: {
          ticketNumber: true,
          isClosed: true,
          stageName: true,
          requestorEmail: true,
          clientExternalId: true,
        },
      });
      const senderInfo = requestor
        ? {
            userId: requestor.id,
            role: requestor.role,
            companyId: requestor.companyId,
          }
        : null;
      if (
        ticket &&
        !ticket.isClosed &&
        (await senderCanReplyToTicket(this.prisma, {
          fromEmail,
          sender: senderInfo,
          routeCompanyId: route?.companyId ?? null,
          ticket,
        }))
      ) {
        appliedToTicket = true;
        status = PreTicketStatus.OPENED;
      } else if (
        ticket &&
        ticket.isClosed &&
        isReopenableStage(ticket.stageName) &&
        (await senderCanReopenTicket(this.prisma, {
          fromEmail,
          sender: senderInfo,
          routeCompanyId: route?.companyId ?? null,
          ticket,
        }))
      ) {
        // Cliente respondeu e-mail de chamado fechado: reabre.
        appliedToTicket = true;
        reopenTicket = true;
        reopenFromStage = ticket.stageName;
        status = PreTicketStatus.OPENED;
      }
      // Demais casos (cancelado, remetente sem vínculo, equipe interna):
      // permanece PENDING com linkedTicketNumber para o operador.
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
      const applied = await this.applyEmailToTicket({
        ticketNumber: linkedTicketNumber,
        fromName: fromName ?? requestor?.name ?? null,
        fromEmail,
        title,
        html: html ?? descriptionHtml,
        text: descriptionText,
        conversationId,
        preTicketId: preTicket.id,
        receivedAt: preTicket.receivedAt,
        authorUserId: requestor?.id ?? systemUploader ?? null,
        reopen: reopenTicket,
        reopenFromStage,
      });
      if (!applied) {
        // Sem autor para gravar: devolve para a fila de pré-tickets em vez
        // de sumir com a resposta do cliente.
        await this.prisma.preTicket.update({
          where: { id: preTicket.id },
          data: {
            status: PreTicketStatus.PENDING,
            appliedToTicket: false,
            ticketNumber: null,
            openedAt: null,
          },
        });
        return true;
      }
      this.logger.log(
        `E-mail aplicado ao chamado #${linkedTicketNumber}` +
          (reopenTicket ? ' (reaberto)' : '') +
          ` (${params.messageId})`,
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
    conversationId: string | null;
    inReplyTo: string | null;
    referencesHeader: string | null;
  }): Promise<number | null> {
    // Só o ASSUNTO identifica resposta de um chamado (é lá que o portal
    // grava "Chamado #NNNNN" nos e-mails de notificação, e é isso que
    // volta no "Re:"). Nunca o corpo: um e-mail novo pode citar um chamado
    // antigo em prosa ("aplicamos a mesma solução do #56117...") e isso
    // não pode reabrir o chamado citado em vez de abrir um novo.
    const fromHash = extractTicketNumberFromText(params.subject);
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

  /**
   * Resposta por e-mail vira comunicação do ticket (não mexe mais na
   * descrição). Retorna false se não houver usuário para autor.
   */
  private async applyEmailToTicket(params: {
    ticketNumber: number;
    fromName: string | null;
    fromEmail: string;
    title: string;
    html: string | null;
    text: string;
    conversationId: string | null;
    preTicketId: string;
    receivedAt: Date;
    authorUserId: string | null;
    reopen: boolean;
    reopenFromStage: string | null;
  }): Promise<boolean> {
    if (!params.authorUserId) {
      this.logger.warn(
        `Sem usuário autor para aplicar e-mail ao ticket #${params.ticketNumber}`,
      );
      return false;
    }

    const actorName = params.fromName
      ? `${params.fromName} (${params.fromEmail})`
      : params.fromEmail;

    await createEmailReplyCommunication(this.prisma, {
      ticketNumber: params.ticketNumber,
      preTicketId: params.preTicketId,
      fromName: params.fromName,
      fromEmail: params.fromEmail,
      html: params.html,
      text: params.text,
      receivedAt: params.receivedAt,
      authorUserId: params.authorUserId,
    });

    if (params.reopen) {
      await reopenTicketFromEmail(this.prisma, {
        ticketNumber: params.ticketNumber,
        fromStageName: params.reopenFromStage,
        actorName,
        preTicketId: params.preTicketId,
      });
    }

    await this.prisma.portalTicket.update({
      where: { ticketNumber: params.ticketNumber },
      data: {
        ...(params.conversationId
          ? { emailConversationId: params.conversationId }
          : {}),
        updatedAtSource: new Date(),
      },
    });

    try {
      await this.prisma.ticketHistory.create({
        data: {
          id: randomUUID(),
          ticketNumber: params.ticketNumber,
          eventType: 'EMAIL_REPLY',
          summary: `Resposta por e-mail de ${params.fromEmail}: ${params.title.slice(0, 160)}`,
          actorName,
          source: 'PORTAL',
          occurredAt: new Date(),
          externalKey: `email:${params.preTicketId}`,
        },
      });
    } catch {
      /* ignore */
    }

    void this.ticketAutomation
      .dispatchNewReplyForUser(params.authorUserId, params.ticketNumber)
      .catch((err) =>
        this.logger.warn(
          `Automações TICKET_NEW_REPLY (e-mail) falharam #${params.ticketNumber}: ${
            err instanceof Error ? err.message : err
          }`,
        ),
      );
    return true;
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
    reason?: string;
    /** Guardado junto: o aviso de não entrega diz qual endereço falhou. */
    detailText?: string | null;
  }) {
    const reason =
      params.reason ??
      'Remetente bloqueado nas configurações de e-mail — não vira pré-ticket.';
    try {
      await this.prisma.preTicket.create({
        data: {
          id: randomUUID(),
          status: PreTicketStatus.IGNORED,
          title: `[ignorado] ${params.title}`.slice(0, 500),
          descriptionText: params.detailText?.trim()
            ? `${reason}\n\n${params.detailText.trim()}`.slice(0, 20_000)
            : reason,
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

  /**
   * Empresa pelo domínio do remetente, quando não há rota nem usuário
   * cadastrado com aquele e-mail. Sem isso o chamado nasce sem cliente e
   * alguém precisa completar na mão depois.
   *
   * Só vale quando o domínio é de um cliente só: domínio compartilhado
   * (gmail, outlook e afins têm gente de várias empresas) não decide nada,
   * e chutar a empresa errada é pior do que deixar em branco.
   */
  private async matchCompanyByDomain(fromEmail: string): Promise<string | null> {
    const domain = fromEmail.includes('@')
      ? fromEmail.split('@')[1]?.trim().toLowerCase()
      : null;
    if (!domain) return null;

    const rows = await this.prisma.user.findMany({
      where: {
        email: { endsWith: `@${domain}`, mode: 'insensitive' },
        companyId: { not: null },
        deletedAt: null,
      },
      select: { companyId: true },
      distinct: ['companyId'],
      take: 2,
    });
    if (rows.length !== 1) return null;
    return rows[0].companyId;
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

/**
 * `EMAIL_INBOUND_IGNORE_BEFORE` (data ISO, ex. 2026-09-14T15:00:00-03:00):
 * e-mails recebidos antes disso nunca viram pré-ticket. Vazio ou inválido
 * desliga o corte.
 */
export function emailInboundIgnoreBefore(
  raw: string | undefined = process.env.EMAIL_INBOUND_IGNORE_BEFORE,
): Date | null {
  const value = raw?.trim();
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

export type AutomatedMessageKind =
  | 'NAO_ENTREGUE'
  | 'RESPOSTA_AUTOMATICA'
  | 'ENVIADO_PELO_PORTAL';

const AUTOMATED_MESSAGE_REASON: Record<AutomatedMessageKind, string> = {
  NAO_ENTREGUE:
    'Aviso de não entrega do servidor de e-mail — não vira pré-ticket nem entra em chamado.',
  RESPOSTA_AUTOMATICA:
    'Resposta automática (ausência) — não vira pré-ticket nem entra em chamado.',
  ENVIADO_PELO_PORTAL:
    'Aviso enviado pelo próprio portal que voltou para a caixa — não vira pré-ticket nem entra em chamado.',
};

/** Remetentes que só mandam aviso de entrega (o do Exchange tem um hash fixo por tenant). */
const BOUNCE_SENDER_LOCAL =
  /^(mailer-daemon|postmaster|microsoftexchange[0-9a-f]{32})$/i;
/** Com dois-pontos: é o prefixo que o servidor coloca, não um assunto escrito por gente. */
const BOUNCE_SUBJECT =
  /^(não é possível entregar|nao e possivel entregar|não entregue|undeliverable|undelivered mail returned to sender)\s*:|^delivery status notification\b/i;
const AUTO_REPLY_SUBJECT =
  /^(resposta automática|resposta automatica|automatic reply|auto-reply|autoreply|out of office|fora do escritório|ausência temporária)\s*:/i;

/**
 * Reconhece aviso de "não entregue" e resposta automática de ausência.
 * Alertas de monitoramento também são automáticos, mas são chamados de
 * verdade — por isso `Auto-Submitted: auto-generated` não conta, só
 * `auto-replied`.
 */
export function detectAutomatedMessage(params: {
  fromEmail: string;
  subject: string;
  headers: Array<{ name?: string; value?: string }>;
}): AutomatedMessageKind | null {
  const header = (name: string) =>
    params.headers
      .find((h) => h.name?.toLowerCase() === name)
      ?.value?.trim()
      .toLowerCase() ?? null;
  const local = params.fromEmail.trim().split('@')[0] ?? '';
  const subject = params.subject.trim();

  // Aviso do próprio portal que voltou para a caixa. Reconhecido pela marca
  // que o envio coloca, não pelo remetente: e-mail encaminhado à mão de
  // suporte@ para a caixa não tem a marca e continua virando chamado.
  if (header(PORTAL_SENT_HEADER) !== null) {
    return 'ENVIADO_PELO_PORTAL';
  }

  if (
    BOUNCE_SENDER_LOCAL.test(local) ||
    header('x-ms-exchange-message-is-ndr') !== null ||
    header('content-type')?.includes('report-type=delivery-status') ||
    BOUNCE_SUBJECT.test(subject)
  ) {
    return 'NAO_ENTREGUE';
  }

  if (
    header('auto-submitted')?.startsWith('auto-replied') ||
    header('x-autoreply') !== null ||
    header('x-autorespond') !== null ||
    AUTO_REPLY_SUBJECT.test(subject)
  ) {
    return 'RESPOSTA_AUTOMATICA';
  }
  return null;
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

// Exportada para teste: o aviso de novo responsável prova contra ela que o
// assunto dele não é lido como resposta de chamado.
export function extractTicketNumberFromText(text: string): number | null {
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
