import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { PortalTicketOrigin, PreTicketStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FileStorageService } from '../../common/storage/file-storage.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { TicketsPortalStoreService } from '../tickets/tickets-portal-store.service';
import { PORTAL_STAGE } from '../tickets/portal-ticket-stages';
import { EmailTemplatesService } from '../mail/email-templates.service';
import { EmailInboundIngestService } from './email-inbound-ingest.service';
import { htmlParaTexto } from './html-para-texto';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { TifluxService } from '../tiflux/tiflux.service';
import { isTicketsTifluxWriteEnabled } from '../tickets/tickets-portal.config';
import { appointmentDescriptionToPlainText } from '../tickets/appointment-doc.util';
import { portalResponsibleSyntheticId } from '../tickets/portal-responsible.helper';

/** Exclusao em lote da fila de pre-tickets. */
export class BulkDeletePreTicketsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  ids!: string[];
}
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

/**
 * Janela da reserva de pré-ticket. Curta de propósito: se a pessoa fechar a
 * aba ou desistir, o e-mail volta sozinho para a fila — não existe estado
 * travado esperando alguém destravar na mão.
 */
const PRE_TICKET_CLAIM_MINUTES = 10;

@Injectable()
export class PreTicketsService {
  private readonly logger = new Logger(PreTicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly portalStore: TicketsPortalStoreService,
    private readonly files: FileStorageService,
    private readonly ingest: EmailInboundIngestService,
    private readonly emailTemplates: EmailTemplatesService,
    private readonly tiflux: TifluxService,
  ) {}

  private assertOperator(actor: AuthenticatedRequestUser) {
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.COLLABORATOR) {
      throw new ForbiddenException('Sem permissão para pré-tickets.');
    }
  }

  /** Mesas ativas, para escolher ao abrir o pré-ticket. */
  async listDesks(): Promise<Array<{ id: string; name: string }>> {
    const mesas = await this.prisma.specialty.findMany({
      where: { deletedAt: null, active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return mesas;
  }

  async countPending(actor: AuthenticatedRequestUser) {
    this.assertOperator(actor);
    const [emailCount, portalCount] = await Promise.all([
      this.prisma.preTicket.count({
        where: { status: PreTicketStatus.PENDING, deletedAt: null },
      }),
      this.prisma.portalTicket.count({
        where: { isPreTicket: true, isClosed: false },
      }),
    ]);
    return emailCount + portalCount;
  }

  private mapPortalPreTicket(row: {
    ticketNumber: number;
    title: string | null;
    requestorName: string | null;
    requestorEmail: string | null;
    clientName: string | null;
    becamePreTicketAt: Date | null;
    createdAtSource: Date | null;
    createdAt: Date;
  }) {
    const receivedAt =
      row.becamePreTicketAt ?? row.createdAtSource ?? row.createdAt;
    return {
      id: `portal:${row.ticketNumber}`,
      title: row.title ?? `Ticket #${row.ticketNumber}`,
      fromName: row.requestorName,
      fromEmail: row.requestorEmail ?? '',
      mailboxAddress: '',
      channel: 'Portal',
      attachmentCount: 0,
      receivedAt: receivedAt.toISOString(),
      ticketNumber: row.ticketNumber,
      portalPreTicket: true as const,
      company: row.clientName ? { id: '', name: row.clientName } : null,
      specialty: null,
      // Reserva vale só para a fila de e-mail; pré-ticket do portal já é um
      // ticket e tem responsável próprio.
      claimedBy: null as { id: string; name: string; since: string } | null,
    };
  }

  async list(actor: AuthenticatedRequestUser, q?: string) {
    this.assertOperator(actor);
    const query = q?.trim();
    const [emailRows, portalRows] = await Promise.all([
      this.prisma.preTicket.findMany({
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
          claimedByUser: { select: { id: true, name: true } },
        },
        orderBy: { receivedAt: 'desc' },
        take: 200,
      }),
      this.prisma.portalTicket.findMany({
        where: {
          isPreTicket: true,
          isClosed: false,
          ...(query
            ? {
                OR: [
                  { title: { contains: query, mode: 'insensitive' } },
                  { requestorEmail: { contains: query, mode: 'insensitive' } },
                  { requestorName: { contains: query, mode: 'insensitive' } },
                  ...(Number.isFinite(Number(query))
                    ? [{ ticketNumber: Number(query) }]
                    : []),
                ],
              }
            : {}),
        },
        select: {
          ticketNumber: true,
          title: true,
          requestorName: true,
          requestorEmail: true,
          clientName: true,
          becamePreTicketAt: true,
          createdAtSource: true,
          createdAt: true,
        },
        orderBy: [{ becamePreTicketAt: 'desc' }, { createdAt: 'desc' }],
        take: 200,
      }),
    ]);

    // Reserva vencida é o mesmo que não ter reserva — some da listagem.
    const cutoff = this.claimCutoff();
    const emailRowsWithClaim = emailRows.map((row) => {
      const active =
        row.claimedByUserId && row.claimedAt && row.claimedAt > cutoff;
      return {
        ...row,
        claimedBy: active
          ? {
              id: row.claimedByUser!.id,
              name: row.claimedByUser!.name,
              since: row.claimedAt!.toISOString(),
            }
          : null,
      };
    });

    const merged = [
      ...emailRowsWithClaim,
      ...portalRows.map((row) => this.mapPortalPreTicket(row)),
    ].sort(
      (a, b) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    );

    return merged.slice(0, 200);
  }

  private claimCutoff(): Date {
    return new Date(Date.now() - PRE_TICKET_CLAIM_MINUTES * 60_000);
  }

  /** Reserva o pré-ticket para o operador, se ninguém tiver reserva válida. */
  async claim(actor: AuthenticatedRequestUser, id: string) {
    this.assertOperator(actor);
    const row = await this.getOne(actor, id);
    if (row.status !== PreTicketStatus.PENDING) {
      throw new BadRequestException('Pré-ticket já processado.');
    }

    // Condicional na própria escrita: livre, reserva expirada, ou já é minha.
    const claimed = await this.prisma.preTicket.updateMany({
      where: {
        id,
        status: PreTicketStatus.PENDING,
        deletedAt: null,
        OR: [
          { claimedByUserId: null },
          { claimedByUserId: actor.userId },
          { claimedAt: { lt: this.claimCutoff() } },
        ],
      },
      data: { claimedByUserId: actor.userId, claimedAt: new Date() },
    });

    if (claimed.count !== 1) {
      const current = await this.prisma.preTicket.findFirst({
        where: { id },
        select: { claimedByUser: { select: { name: true } } },
      });
      throw new BadRequestException(
        `${current?.claimedByUser?.name ?? 'Outro usuário'} está atendendo este pré-ticket.`,
      );
    }

    return { ok: true, claimedUntilMinutes: PRE_TICKET_CLAIM_MINUTES };
  }

  /** Devolve para a fila. Só quem reservou (ou um ADMIN) pode liberar. */
  async release(actor: AuthenticatedRequestUser, id: string) {
    this.assertOperator(actor);
    await this.prisma.preTicket.updateMany({
      where: {
        id,
        deletedAt: null,
        ...(actor.role === UserRole.ADMIN
          ? {}
          : { claimedByUserId: actor.userId }),
      },
      data: { claimedByUserId: null, claimedAt: null },
    });
    return { ok: true };
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

  /**
   * Chamado do portal que caiu na fila só por estar sem responsável. Ele já é
   * um ticket de verdade: sai daqui quando alguém assume, e excluir seria
   * apagar atendimento real.
   */
  private assertNaoEhTicketDoPortal(id: string) {
    if (id.startsWith('portal:')) {
      throw new BadRequestException(
        'Este é um chamado sem responsável, não um pré-ticket de e-mail. Atribua um responsável em vez de excluir.',
      );
    }
  }

  async softDelete(actor: AuthenticatedRequestUser, id: string) {
    this.assertOperator(actor);
    this.assertNaoEhTicketDoPortal(id);
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

  /**
   * Exclusão em lote da fila de e-mail. Vale a mesma regra do botão de uma
   * linha só: chamado do portal não é excluível, e pré-ticket já processado
   * por outra pessoa é ignorado em silêncio em vez de derrubar o lote todo.
   */
  async softDeleteMany(actor: AuthenticatedRequestUser, ids: string[]) {
    this.assertOperator(actor);
    const unicos = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    const doPortal = unicos.filter((id) => id.startsWith('portal:'));
    if (doPortal.length > 0) {
      throw new BadRequestException(
        'A seleção inclui chamados sem responsável, que não podem ser excluídos. Desmarque-os e tente de novo.',
      );
    }
    if (unicos.length === 0) {
      return { excluidos: 0, ignorados: 0 };
    }
    const result = await this.prisma.preTicket.updateMany({
      where: {
        id: { in: unicos },
        status: PreTicketStatus.PENDING,
        deletedAt: null,
      },
      data: {
        status: PreTicketStatus.DELETED,
        deletedAt: new Date(),
      },
    });
    return {
      excluidos: result.count,
      ignorados: unicos.length - result.count,
    };
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

    // Trava atômica: a fila é compartilhada entre operadores e a abertura leva
    // tempo (chamada ao TiFlux, alocação de número, anexos). Sem marcar OPENED
    // já aqui, dois cliques simultâneos passariam pela checagem acima e
    // criariam dois chamados para o mesmo e-mail. Só quem consegue o UPDATE
    // segue; em caso de falha no meio do caminho, volta para PENDING.
    const claimed = await this.prisma.preTicket.updateMany({
      where: { id, status: PreTicketStatus.PENDING, deletedAt: null },
      data: {
        status: PreTicketStatus.OPENED,
        openedAt: new Date(),
        openedByUserId: actor.userId,
      },
    });
    if (claimed.count !== 1) {
      throw new BadRequestException(
        'Pré-ticket já processado por outro usuário.',
      );
    }

    try {
      return await this.openAsTicketClaimed(actor, id, dto, row);
    } catch (err) {
      // Devolve para a fila para não perder o e-mail em caso de erro.
      await this.prisma.preTicket
        .updateMany({
          where: { id, status: PreTicketStatus.OPENED, ticketNumber: null },
          data: {
            status: PreTicketStatus.PENDING,
            openedAt: null,
            openedByUserId: null,
          },
        })
        .catch((revertErr) => {
          this.logger.error(
            `Falha ao devolver pré-ticket ${id} para a fila: ${
              revertErr instanceof Error ? revertErr.message : revertErr
            }`,
          );
        });
      throw err;
    }
  }

  /** Corpo da abertura — só roda para quem venceu a trava em `openAsTicket`. */
  private async openAsTicketClaimed(
    actor: AuthenticatedRequestUser,
    id: string,
    dto: OpenPreTicketDto,
    row: Awaited<ReturnType<PreTicketsService['getOne']>>,
  ) {
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

    // Pré-ticket pode chegar sem empresa (remetente não reconhecido), mas o
    // chamado não pode nascer sem: quem atende informa na hora de abrir.
    if (!company) {
      throw new BadRequestException(
        'Escolha a empresa antes de abrir o chamado: o remetente deste e-mail não foi reconhecido.',
      );
    }

    const specialtyId =
      dto.specialtyId?.trim() || dto.deskId?.trim() || row.specialtyId;
    // Aceita o identificador interno ou o código numérico da mesa: a tela
    // de pré-ticket usa o catálogo de criação de chamado, que é o que
    // colaborador enxerga — a lista de mesas do cadastro de usuários exige
    // o módulo Usuários, que nem todo atendente tem.
    const desk = specialtyId
      ? await this.prisma.specialty.findFirst({
          where: {
            deletedAt: null,
            ...(/^\d+$/.test(specialtyId)
              ? { externalId: Number(specialtyId) }
              : { id: specialtyId }),
          },
        })
      : null;
    // Abrir chamado pela tela exige mesa; abrir a partir do e-mail não
    // exigia, e o chamado nascia sem nenhuma quando o remetente não casava
    // com uma regra de direcionamento. Sem mesa ele fica fora da fila da
    // equipe e da distribuição por mesa dos relatórios.
    if (!desk) {
      throw new BadRequestException(
        'Escolha a mesa antes de abrir o chamado: este e-mail não casou com nenhuma regra de direcionamento.',
      );
    }

    const title = (dto.title?.trim() || row.title).slice(0, 500);
    // Mantém HTML quando há imagem embutida; senão usa texto limpo.
    const html = row.descriptionHtml?.trim() ?? '';
    const hasInlineImage = /<img[\s\S]*src\s*=/i.test(html);
    const description = hasInlineImage
      ? html
      : row.descriptionText?.trim() ||
        htmlParaTexto(row.descriptionHtml) ||
        '(sem descrição)';

    const opener = await this.prisma.user.findFirst({
      where: { id: actor.userId, deletedAt: null },
      select: { id: true, name: true, email: true },
    });

    const responsibleExternalId = dto.responsibleExternalId
      ? Number(dto.responsibleExternalId)
      : null;
    const responsibleName = dto.responsibleName?.trim() || opener?.name || null;

    const isPreTicket = !responsibleName;

    let resolvedResponsibleExternalId = Number.isFinite(
      responsibleExternalId as number,
    )
      ? (responsibleExternalId as number)
      : null;
    if (resolvedResponsibleExternalId == null && responsibleName) {
      const respUser = await this.prisma.user.findFirst({
        where: {
          name: { equals: responsibleName, mode: 'insensitive' },
          deletedAt: null,
        },
        select: { id: true, email: true },
      });
      if (respUser?.email) {
        const respEmail = respUser.email.trim().toLowerCase();
        try {
          const respRows =
            (await this.prisma.$queryRaw<Array<{ external_id: number }>>`
              SELECT tu.external_id
              FROM tiflux.users tu
              WHERE lower(trim(tu.email)) = ${respEmail}
                AND COALESCE(tu.active, true) = true
              ORDER BY tu.external_id ASC
              LIMIT 1
            `) ?? [];
          if (respRows[0]) {
            resolvedResponsibleExternalId = Number(respRows[0].external_id);
          }
        } catch {
          /* schema tiflux.* ausente */
        }
      }
      if (resolvedResponsibleExternalId == null && respUser) {
        resolvedResponsibleExternalId = portalResponsibleSyntheticId(
          respUser.id,
        );
      }
    }
    const writeTiflux = isTicketsTifluxWriteEnabled();
    const syncToTiflux = writeTiflux && !isPreTicket;

    let ticketNumber = 0;
    if (syncToTiflux) {
      if (!company?.tifluxClientId) {
        throw new BadRequestException(
          'Cliente sem vínculo externo configurado.',
        );
      }
      if (!desk?.externalId) {
        throw new BadRequestException(
          'Catálogo sem vínculo externo configurado.',
        );
      }
      const descriptionPlain = appointmentDescriptionToPlainText(description);
      const raw = await this.tiflux.createTicket({
        title,
        description: descriptionPlain || '(sem descrição)',
        client_id: company.tifluxClientId,
        desk_id: desk.externalId,
        responsible_id: responsibleExternalId,
        requestor_name: row.fromName?.trim() || 'Solicitante',
        requestor_email: row.fromEmail?.trim() || undefined,
      });
      ticketNumber = Number(
        (raw as { ticket?: { ticket_number?: number } })?.ticket?.ticket_number,
      );
      if (!Number.isFinite(ticketNumber)) {
        throw new BadGatewayException(
          'Não foi possível obter o número do ticket criado.',
        );
      }
    }

    const ticketInput = {
      title,
      clientName: company?.tifluxClientName || company?.name || null,
      clientExternalId: company?.tifluxClientId ?? null,
      deskExternalId: desk?.externalId ?? null,
      deskName: desk?.name ?? null,
      responsibleExternalId: resolvedResponsibleExternalId,
      responsibleName,
      // O nome do remetente é opcional no e-mail; o endereço sempre existe.
      // Sem esse fallback o chamado nascia sem solicitante e sumia dos
      // filtros e relatórios que se guiam por ele.
      requestorName: row.fromName?.trim() || row.fromEmail,
      requestorEmail: row.fromEmail,
      requestorTelephone: null,
      statusName: PORTAL_STAGE.NOVO,
      stageName: PORTAL_STAGE.NOVO,
      priorityName: dto.priorityName?.trim() || row.priorityName,
      createdByWayOf: syncToTiflux ? 'Integração' : 'E-mail',
      isClosed: false,
      origin: syncToTiflux
        ? PortalTicketOrigin.TIFLUX
        : PortalTicketOrigin.PORTAL,
      isPreTicket,
      becamePreTicketAt: isPreTicket ? new Date() : null,
      specialtyId: desk?.id ?? null,
      emailConversationId: row.conversationId ?? null,
      createdAtSource: row.receivedAt,
      updatedAtSource: new Date(),
      createdBy: actor.userId,
    };

    if (syncToTiflux) {
      await this.portalStore.upsertByTicketNumber({
        ...ticketInput,
        ticketNumber,
      });
    } else {
      ticketNumber =
        await this.portalStore.createWithNewTicketNumber(ticketInput);
    }

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

