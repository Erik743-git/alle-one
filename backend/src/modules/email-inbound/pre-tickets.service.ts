import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { PortalTicketOrigin, PreTicketStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FileStorageService } from '../../common/storage/file-storage.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { TicketsPortalStoreService } from '../tickets/tickets-portal-store.service';
import { EmailTemplatesService } from '../mail/email-templates.service';
import { EmailInboundIngestService } from './email-inbound-ingest.service';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class OpenPreTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  responsibleExternalId?: string;

  @IsOptional()
  @IsString()
  responsibleName?: string;

  @IsOptional()
  @IsString()
  specialtyId?: string;

  /** @deprecated Prefer specialtyId */
  @IsOptional()
  @IsString()
  deskId?: string;

  @IsOptional()
  @IsString()
  priorityName?: string;

  @IsOptional()
  @IsString()
  companyId?: string;
}

@Injectable()
export class PreTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portalStore: TicketsPortalStoreService,
    private readonly files: FileStorageService,
    private readonly ingest: EmailInboundIngestService,
    private readonly emailTemplates: EmailTemplatesService,
  ) {}

  private assertOperator(actor: AuthenticatedRequestUser) {
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.COLLABORATOR) {
      throw new ForbiddenException('Sem permissão para pré-tickets.');
    }
  }

  async countPending(actor: AuthenticatedRequestUser) {
    this.assertOperator(actor);
    return this.prisma.preTicket.count({
      where: { status: PreTicketStatus.PENDING, deletedAt: null },
    });
  }

  async list(actor: AuthenticatedRequestUser, q?: string) {
    this.assertOperator(actor);
    const query = q?.trim();
    return this.prisma.preTicket.findMany({
      where: {
        status: PreTicketStatus.PENDING,
        deletedAt: null,
        ...(query
          ? {
              OR: [
                { title: { contains: query, mode: 'insensitive' } },
                { fromEmail: { contains: query, mode: 'insensitive' } },
                { fromName: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        company: { select: { id: true, name: true } },
        specialty: { select: { id: true, name: true, externalId: true } },
      },
      orderBy: { receivedAt: 'desc' },
      take: 200,
    });
  }

  async getOne(actor: AuthenticatedRequestUser, id: string) {
    this.assertOperator(actor);
    await this.ingest.repairInlineImagesIfNeeded(id);
    const row = await this.prisma.preTicket.findFirst({
      where: { id, deletedAt: null },
      include: {
        company: { select: { id: true, name: true, tifluxClientId: true } },
        specialty: { select: { id: true, name: true, externalId: true } },
        requestorUser: { select: { id: true, name: true, email: true } },
        attachments: true,
      },
    });
    if (!row) throw new NotFoundException('Pré-ticket não encontrado.');
    return row;
  }

  async downloadAttachment(
    actor: AuthenticatedRequestUser,
    preTicketId: string,
    attachmentId: string,
    inline: boolean,
  ) {
    this.assertOperator(actor);
    const row = await this.prisma.preTicketAttachment.findFirst({
      where: { id: attachmentId, preTicketId },
      include: { file: true },
    });
    if (!row?.file || row.file.deletedAt) {
      throw new NotFoundException('Anexo não encontrado.');
    }
    if (!(await this.files.exists(row.file.path))) {
      throw new NotFoundException('Arquivo não encontrado no servidor.');
    }
    const buffer = await this.files.readBuffer(row.file.path);
    return {
      stream: new StreamableFile(buffer),
      meta: {
        originalName: row.file.originalName,
        mimeType: row.file.mimeType,
        inline,
      },
    };
  }

  async softDelete(actor: AuthenticatedRequestUser, id: string) {
    this.assertOperator(actor);
    const row = await this.getOne(actor, id);
    if (row.status !== PreTicketStatus.PENDING) {
      throw new BadRequestException('Pré-ticket já processado.');
    }
    return this.prisma.preTicket.update({
      where: { id },
      data: {
        status: PreTicketStatus.DELETED,
        deletedAt: new Date(),
      },
    });
  }

  async openAsTicket(
    actor: AuthenticatedRequestUser,
    id: string,
    dto: OpenPreTicketDto,
  ) {
    this.assertOperator(actor);
    const row = await this.getOne(actor, id);
    if (row.status !== PreTicketStatus.PENDING) {
      throw new BadRequestException('Pré-ticket já processado.');
    }

    const companyId = dto.companyId?.trim() || row.companyId;
    const company = companyId
      ? await this.prisma.company.findFirst({
          where: { id: companyId, deletedAt: null },
          select: {
            id: true,
            name: true,
            tifluxClientId: true,
            tifluxClientName: true,
          },
        })
      : null;

    const specialtyId =
      dto.specialtyId?.trim() || dto.deskId?.trim() || row.specialtyId;
    const desk = specialtyId
      ? await this.prisma.specialty.findFirst({
          where: { id: specialtyId, deletedAt: null },
        })
      : null;

    const ticketNumber = await this.portalStore.allocatePortalTicketNumber();
    const title = (dto.title?.trim() || row.title).slice(0, 500);
    // Mantém HTML quando há imagem embutida; senão usa texto limpo.
    const html = row.descriptionHtml?.trim() ?? '';
    const hasInlineImage = /<img[\s\S]*src\s*=/i.test(html);
    const description = hasInlineImage
      ? html
      : row.descriptionText?.trim() ||
        stripHtmlForTicket(row.descriptionHtml) ||
        '(sem descrição)';

    const opener = await this.prisma.user.findFirst({
      where: { id: actor.userId, deletedAt: null },
      select: { id: true, name: true, email: true },
    });

    const responsibleExternalId = dto.responsibleExternalId
      ? Number(dto.responsibleExternalId)
      : null;
    const responsibleName = dto.responsibleName?.trim() || opener?.name || null;

    await this.portalStore.upsertByTicketNumber({
      ticketNumber,
      title,
      clientName: company?.tifluxClientName || company?.name || null,
      clientExternalId: company?.tifluxClientId ?? null,
      deskExternalId: desk?.externalId ?? null,
      deskName: desk?.name ?? null,
      responsibleExternalId: Number.isFinite(responsibleExternalId)
        ? responsibleExternalId
        : null,
      responsibleName,
      requestorName: row.fromName,
      requestorEmail: row.fromEmail,
      requestorTelephone: null,
      statusName: 'Aberto',
      stageName: 'Pendente',
      priorityName: dto.priorityName?.trim() || row.priorityName,
      createdByWayOf: 'E-mail',
      isClosed: false,
      origin: PortalTicketOrigin.PORTAL,
      createdAtSource: row.receivedAt,
      updatedAtSource: new Date(),
      createdBy: actor.userId,
    });

    await this.prisma.portalTicketDescription.upsert({
      where: { ticketNumber },
      create: {
        ticketNumber,
        description,
        createdBy: actor.userId,
      },
      update: {
        description,
      },
    });

    // Vincula anexos do pré-ticket (ZIP/PDF/etc.) ao ticket para download na tela.
    const preAttachments = await this.prisma.preTicketAttachment.findMany({
      where: { preTicketId: id },
      select: { fileId: true },
    });
    if (preAttachments.length > 0) {
      const already =
        await this.prisma.portalTicketAppointmentAttachment.findMany({
          where: {
            ticketNumber,
            fileId: { in: preAttachments.map((a) => a.fileId) },
          },
          select: { fileId: true },
        });
      const linked = new Set(already.map((a) => a.fileId));
      for (const att of preAttachments) {
        if (linked.has(att.fileId)) continue;
        await this.prisma.portalTicketAppointmentAttachment.create({
          data: {
            ticketNumber,
            portalAppointmentId: null,
            fileId: att.fileId,
            createdBy: actor.userId,
          },
        });
      }
    }

    await this.prisma.preTicket.update({
      where: { id },
      data: {
        status: PreTicketStatus.OPENED,
        ticketNumber,
        openedAt: new Date(),
        openedByUserId: actor.userId,
        companyId: company?.id ?? row.companyId,
        specialtyId: desk?.id ?? row.specialtyId,
        priorityName: dto.priorityName?.trim() || row.priorityName,
        title,
      },
    });

    const fromLabel = [row.fromName, row.fromEmail].filter(Boolean).join(' · ');
    await this.prisma.ticketHistory.create({
      data: {
        ticketNumber,
        eventType: 'TICKET_CREATED',
        summary: fromLabel
          ? `Ticket gerado a partir de e-mail (${fromLabel})`
          : 'Ticket gerado a partir de e-mail',
        actorName: opener?.name ?? null,
        source: 'PORTAL',
        externalKey: `pre-ticket:${id}`,
        payload: {
          preTicketId: id,
          mailboxAddress: row.mailboxAddress,
          fromEmail: row.fromEmail,
          fromName: row.fromName,
          channel: row.channel,
        },
        occurredAt: row.receivedAt ?? new Date(),
      },
    });

    if (row.fromEmail?.trim()) {
      void this.emailTemplates
        .sendTicketRegistered({
          to: row.fromEmail.trim(),
          ticketNumber,
          title,
          requestorName: row.fromName,
          companyName: company?.tifluxClientName || company?.name || null,
          openedAt: row.receivedAt ?? new Date(),
        })
        .catch(() => undefined);
    }

    return { ticketNumber, preTicketId: id };
  }
}

function stripHtmlForTicket(html: string | null | undefined): string {
  if (!html?.trim()) return '';
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20_000);
}
