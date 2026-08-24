import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  forwardRef,
} from '@nestjs/common';
import {
  PortalTicketOrigin,
  PortalTifluxOutboxKind,
  PortalTifluxOutboxStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
export type {
  TicketHistoryDto,
  TicketListItemDto,
} from './tickets-query.service';
import { TifluxService } from '../tiflux/tiflux.service';
import type { CreateTicketDto, UpdateTicketDto } from './tickets-create.dto';
import {
  appointmentDescriptionToPlainText,
  enrichAppointmentDescriptionWithImages,
  type SavedAppointmentImage,
} from './appointment-doc.util';
import { TicketsAppointmentsService } from './tickets-appointments.service';
import { TicketsCatalogsService } from './tickets-catalogs.service';
import {
  isTicketsPortalCanonical,
  isTicketsTifluxWriteEnabled,
  isTifluxDisconnected,
} from './tickets-portal.config';
import { TicketsPortalStoreService } from './tickets-portal-store.service';
import { portalResponsibleSyntheticId } from './portal-responsible.helper';
import { EmailTemplatesService } from '../mail/email-templates.service';
import { TenantScopeService } from '../../common/security/tenant-scope.service';
import { isClientPortalRole } from '../../common/security/client-portal-role';
import { assertTicketCreateClientScope } from './tickets-client-scope';
import { assertDeskAllowedForCompany } from './company-ticket-specialties.helper';
import { canonicalizeStageName } from './tickets-stage-groups';
import { PORTAL_STAGE } from './portal-ticket-stages';
import {
  actorDisplayName,
  recordPortalTicketHistory,
} from './portal-ticket-history';
import { TicketAutomationService } from './ticket-automation.service';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tiflux: TifluxService,
    private readonly catalogs: TicketsCatalogsService,
    private readonly appointments: TicketsAppointmentsService,
    private readonly portalStore: TicketsPortalStoreService,
    private readonly emailTemplates: EmailTemplatesService,
    private readonly tenantScope: TenantScopeService,
    @Inject(forwardRef(() => TicketAutomationService))
    private readonly ticketAutomation: TicketAutomationService,
  ) {}

  /** Autocomplete de usuários do portal para pessoas em cópia (seguidores). */
  async searchUsersForCc(q?: string) {
    const term = q?.trim() ?? '';
    if (term.length < 2) return [];

    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        companyId: true,
      },
      orderBy: [{ name: 'asc' }],
      take: 15,
    });
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /** ADMIN ou técnico responsável (mesmo external_id TiFlux / e-mail casado). */
  async actorCanChangeTicketClient(
    actor: AuthenticatedRequestUser,
    responsibleExternalId: number | null | undefined,
  ): Promise<boolean> {
    if (actor.role === 'ADMIN') return true;
    if (
      responsibleExternalId == null ||
      !Number.isFinite(Number(responsibleExternalId))
    ) {
      return false;
    }
    const mine = await this.resolveTifluxExternalIdForUser(actor.email);
    return (
      mine != null && Number(mine.externalId) === Number(responsibleExternalId)
    );
  }

  private async resolveTifluxExternalIdForUser(
    email: string,
  ): Promise<{ externalId: number; name: string | null } | null> {
    const normalized = this.normalizeEmail(email);
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: normalized, mode: 'insensitive' },
        deletedAt: null,
      },
      select: { id: true, name: true },
    });

    if (isTifluxDisconnected()) {
      const name = user?.name?.trim();
      if (!user || !name) return null;
      return {
        externalId: portalResponsibleSyntheticId(user.id),
        name,
      };
    }

    try {
      const rows =
        (await this.prisma.$queryRaw<
          Array<{ external_id: number; name: string | null }>
        >`
          SELECT tu.external_id, tu.name
          FROM tiflux.users tu
          WHERE lower(trim(tu.email)) = ${normalized}
            AND COALESCE(tu.active, true) = true
          ORDER BY tu.external_id ASC
          LIMIT 1
        `) ?? [];
      const row = rows[0];
      if (row) {
        return {
          externalId: Number(row.external_id),
          name: row.name,
        };
      }
    } catch {
      /* schema tiflux.* ausente */
    }

    const name = user?.name?.trim();
    if (!name || !user) return null;

    const ticket = await this.prisma.portalTicket.findFirst({
      where: {
        responsibleName: { equals: name, mode: 'insensitive' },
        responsibleExternalId: { not: null },
      },
      select: { responsibleExternalId: true, responsibleName: true },
      orderBy: { updatedAtSource: 'desc' },
    });
    if (ticket?.responsibleExternalId == null) {
      return {
        externalId: portalResponsibleSyntheticId(user.id),
        name,
      };
    }
    return {
      externalId: ticket.responsibleExternalId,
      name: ticket.responsibleName,
    };
  }

  private normalizeExternalGmudRef(value: string | null | undefined) {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) return null;
    if (trimmed.length > 120) {
      throw new BadRequestException(
        'Referência GMUD externa deve ter no máximo 120 caracteres.',
      );
    }
    return trimmed;
  }

  private async upsertTicketGmudLink(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    externalGmudRef: string,
  ) {
    await this.prisma.portalTicketGmudLink.upsert({
      where: { ticketNumber },
      create: {
        ticketNumber,
        externalGmudRef,
        createdBy: actor.userId,
      },
      update: { externalGmudRef },
    });
  }

  async linkTicketGmud(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    externalGmudRef: string | null | undefined,
  ) {
    const portal = await this.prisma.portalTicket.findUnique({
      where: { ticketNumber },
      select: { ticketNumber: true },
    });

    let found = Boolean(portal);
    if (!found) {
      try {
        const rows =
          (await this.prisma.$queryRaw<Array<{ ticket_number: number }>>`
            SELECT t.ticket_number
            FROM tiflux.tickets t
            WHERE t.ticket_number = ${ticketNumber}
            LIMIT 1
          `) ?? [];
        found = Boolean(rows[0]);
      } catch {
        found = false;
      }
    }

    if (!found) {
      throw new NotFoundException('Ticket não encontrado.');
    }

    if (externalGmudRef === undefined) {
      throw new BadRequestException(
        'Informe externalGmudRef (referência do cliente) ou null para remover o vínculo.',
      );
    }

    const normalized = this.normalizeExternalGmudRef(externalGmudRef);
    if (!normalized) {
      await this.prisma.portalTicketGmudLink.deleteMany({
        where: { ticketNumber },
      });
      return { ok: true, externalGmudRef: null };
    }

    await this.upsertTicketGmudLink(actor, ticketNumber, normalized);
    return { ok: true, externalGmudRef: normalized };
  }

  getFilterCatalogs(actor: AuthenticatedRequestUser) {
    return this.catalogs.getFilterCatalogs(actor);
  }

  getCreateCatalogs(
    actor: AuthenticatedRequestUser,
    deskId?: number,
    clientId?: number,
  ) {
    return this.catalogs.getCreateCatalogs(actor, deskId, clientId);
  }

  private async resolveDeskMetaForCreate(
    deskId: number,
    writeTiflux: boolean,
  ): Promise<{ name: string; requireServiceCatalog: boolean }> {
    if (writeTiflux) {
      const desk = await this.tiflux.getDesk(deskId);
      return {
        name: String(desk.display_name ?? desk.name ?? ''),
        requireServiceCatalog: Boolean(
          desk.require_service_catalog_open_ticket,
        ),
      };
    }

    const portalDesk = await this.prisma.specialty.findFirst({
      where: { externalId: deskId, deletedAt: null, active: true },
      select: { name: true },
    });
    if (portalDesk) {
      return { name: portalDesk.name, requireServiceCatalog: false };
    }

    return { name: `Mesa ${deskId}`, requireServiceCatalog: false };
  }

  private async resolveClientName(clientId: number): Promise<string | null> {
    const company = await this.prisma.company.findFirst({
      where: { tifluxClientId: clientId, deletedAt: null },
      select: { name: true, tifluxClientName: true },
    });
    if (!company) return null;
    return company.tifluxClientName?.trim() || company.name || null;
  }

  async createTicket(
    actor: AuthenticatedRequestUser,
    dto: CreateTicketDto,
    files: Express.Multer.File[] = [],
  ) {
    await assertTicketCreateClientScope(this.tenantScope, actor, dto.clientId);

    if (isClientPortalRole(actor.role)) {
      const company = await this.prisma.company.findFirst({
        where: { tifluxClientId: dto.clientId, deletedAt: null },
        select: { id: true },
      });
      await assertDeskAllowedForCompany(
        this.prisma,
        company?.id ?? actor.companyId,
        dto.deskId,
      );
    }

    const writeTiflux = isTicketsTifluxWriteEnabled();
    this.logger.log(
      `createTicket writeTiflux=${writeTiflux} canonical=${isTicketsPortalCanonical()} disconnected=${isTifluxDisconnected()}`,
    );
    const deskMeta = await this.resolveDeskMetaForCreate(
      dto.deskId,
      writeTiflux,
    );
    const tifluxDeskName = deskMeta.name;
    const requiresCatalog = deskMeta.requireServiceCatalog;

    await this.catalogs.assertValidClassificationForDesk(
      dto.deskId,
      dto.classificationId,
      tifluxDeskName,
    );

    if (requiresCatalog && !dto.servicesCatalogsItemId) {
      throw new BadRequestException('Selecione o serviço do catálogo.');
    }

    const requestorName = dto.requestorName?.trim() ?? '';
    const requestorEmail = dto.requestorEmail?.trim() ?? '';
    if (requestorName.length < 2) {
      throw new BadRequestException('Informe o nome do solicitante.');
    }
    if (!requestorEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestorEmail)) {
      throw new BadRequestException('Informe um e-mail válido do solicitante.');
    }
    const requestorTelephone = dto.requestorTelephone?.trim() || null;
    if (requestorTelephone) {
      const digits = requestorTelephone.replace(/\D/g, '');
      if (digits.length !== 10 && digits.length !== 11) {
        throw new BadRequestException(
          'Telefone inválido. Use DDD + número (10 ou 11 dígitos).',
        );
      }
    }

    const descriptionRaw = dto.description.trim();
    const descriptionPlain = appointmentDescriptionToPlainText(descriptionRaw);
    if (!descriptionPlain && files.length === 0) {
      throw new BadRequestException('Informe a descrição do chamado.');
    }

    const servicesCatalogsItemId =
      dto.servicesCatalogsItemId != null &&
      Number.isFinite(Number(dto.servicesCatalogsItemId))
        ? Number(dto.servicesCatalogsItemId)
        : null;

    const allowedResponsibles = isClientPortalRole(actor.role)
      ? actor.companyId
        ? await this.catalogs.listCompanyUsersAsResponsibles(actor.companyId)
        : []
      : await this.catalogs.listResponsiblesForCatalogs();

    const explicitlyNoResponsible = dto.responsibleId === null;
    let responsibleId = explicitlyNoResponsible
      ? null
      : (dto.responsibleId ?? null);

    if (responsibleId == null && !explicitlyNoResponsible) {
      const mine = await this.resolveTifluxExternalIdForUser(actor.email);
      if (writeTiflux) {
        const mineAllowed = mine
          ? allowedResponsibles.some((row) => row.id === mine.externalId)
          : false;
        responsibleId = mineAllowed ? (mine?.externalId ?? null) : null;
      } else {
        const mineInList = mine
          ? allowedResponsibles.find((row) => row.id === mine.externalId)
          : null;
        if (mineInList) {
          responsibleId = mineInList.id;
        } else {
          const byEmail = allowedResponsibles.find(
            (row) =>
              row.email != null &&
              this.normalizeEmail(row.email) ===
                this.normalizeEmail(actor.email),
          );
          responsibleId = byEmail?.id ?? null;
        }
      }
    } else if (
      responsibleId != null &&
      allowedResponsibles.length > 0 &&
      !allowedResponsibles.some((row) => row.id === responsibleId)
    ) {
      throw new BadRequestException(
        isClientPortalRole(actor.role)
          ? 'O responsável selecionado não pertence à sua empresa.'
          : 'O responsável selecionado não é válido (precisa estar ativo e marcado como responsável no cadastro).',
      );
    }

    // Determina se o ticket será pré-ticket (sem responsável)
    const isPreTicket = responsibleId == null;
    /** Pré-tickets ficam só no portal; tickets com responsável podem ir à API TiFlux. */
    const syncToTiflux = writeTiflux && !isPreTicket;

    if (syncToTiflux && !requiresCatalog && !dto.priorityId) {
      throw new BadRequestException('Esta mesa exige uma prioridade.');
    }

    let tifluxDescription = descriptionPlain;
    if (dto.classificationId) {
      const pathLabel = await this.catalogs.resolveClassificationPathLabel(
        dto.classificationId,
      );
      if (pathLabel) {
        tifluxDescription = `Classificação: ${pathLabel}\n\n${descriptionPlain}`;
      }
    }

    const payload = {
      title: dto.title.trim(),
      description: tifluxDescription,
      client_id: dto.clientId,
      desk_id: dto.deskId,
      priority_id: dto.priorityId ?? undefined,
      services_catalogs_item_id: servicesCatalogsItemId ?? undefined,
      responsible_id: responsibleId ?? undefined,
      requestor_id: dto.requestorId ?? undefined,
      requestor_name: requestorName,
      requestor_email: requestorEmail,
      requestor_telephone: requestorTelephone || undefined,
    };

    const responsibleMeta = responsibleId
      ? allowedResponsibles.find((row) => row.id === responsibleId)
      : null;
    const clientName = await this.resolveClientName(dto.clientId);
    const mineForName =
      responsibleMeta?.name == null
        ? await this.resolveTifluxExternalIdForUser(actor.email)
        : null;
    const responsibleName =
      responsibleMeta?.name ??
      (responsibleId != null && mineForName?.externalId === responsibleId
        ? mineForName.name
        : null);

    try {
      let ticketNumber: number;
      let tifluxRaw: unknown = null;

      if (syncToTiflux) {
        const raw = await this.tiflux.createTicket(payload);
        tifluxRaw = raw;
        ticketNumber = Number(
          (raw as { ticket?: { ticket_number?: number } })?.ticket
            ?.ticket_number,
        );
        if (!Number.isFinite(ticketNumber)) {
          throw new BadGatewayException(
            'Não foi possível obter o número do ticket criado.',
          );
        }
        await this.appointments.recordOutbox({
          kind: PortalTifluxOutboxKind.CREATE_TICKET,
          status: PortalTifluxOutboxStatus.SYNCED,
          ticketNumber,
          tifluxExternalId: null,
          payload,
          errorMessage: null,
          createdBy: actor.userId,
        });
      } else {
        ticketNumber = await this.portalStore.allocatePortalTicketNumber();
      }

      await this.portalStore.upsertByTicketNumber({
        ticketNumber,
        title: dto.title.trim(),
        clientName,
        clientExternalId: dto.clientId,
        deskExternalId: dto.deskId,
        deskName: tifluxDeskName || null,
        responsibleExternalId: responsibleId,
        responsibleName,
        requestorName,
        requestorEmail,
        requestorTelephone,
        statusName: PORTAL_STAGE.NOVO,
        stageName: PORTAL_STAGE.NOVO,
        priorityName: null,
        createdByWayOf: syncToTiflux ? 'Integração' : 'Portal',
        isClosed: false,
        origin: syncToTiflux
          ? PortalTicketOrigin.TIFLUX
          : PortalTicketOrigin.PORTAL,
        isPreTicket: isPreTicket,
        becamePreTicketAt: isPreTicket ? new Date() : null,
        classificationId: dto.classificationId?.trim() || null,
        createdAtSource: new Date(),
        updatedAtSource: new Date(),
        createdBy: actor.userId,
      });

      const externalGmudRef = this.normalizeExternalGmudRef(
        dto.externalGmudRef,
      );
      if (externalGmudRef) {
        await this.upsertTicketGmudLink(actor, ticketNumber, externalGmudRef);
      }

      await this.savePortalTicketDescription(
        actor,
        ticketNumber,
        descriptionRaw,
        files,
      );

      const ccEmails = Array.from(
        new Set(
          (dto.ccEmails ?? [])
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean),
        ),
      );
      if (ccEmails.length > 0) {
        await this.prisma.portalTicketWatcher.createMany({
          data: ccEmails.map((email) => ({
            ticketNumber,
            email,
            createdBy: actor.userId,
          })),
          skipDuplicates: true,
        });
      }

      void this.emailTemplates
        .sendTicketRegistered({
          to: requestorEmail,
          cc: ccEmails,
          ticketNumber,
          title: dto.title.trim(),
          requestorName,
          companyName: clientName,
          openedAt: new Date(),
        })
        .catch(() => undefined);

      const actorName = await actorDisplayName(this.prisma, actor);
      await recordPortalTicketHistory(this.prisma, {
        ticketNumber,
        eventType: 'TICKET_CREATED',
        summary: `${actorName} abriu o chamado`,
        actorName,
        externalKey: `ticket_created:${ticketNumber}`,
      });

      if (isPreTicket) {
        await recordPortalTicketHistory(this.prisma, {
          ticketNumber,
          eventType: 'PRE_TICKET_CREATED',
          summary:
            'Chamado em triagem (pré-ticket) aguardando atribuição de responsável',
          actorName,
          externalKey: `pre_ticket_created:${ticketNumber}`,
        });
      }

      void this.ticketAutomation
        .handleTicketOpened(actor, ticketNumber)
        .catch((err) =>
          this.logger.warn(
            `Automações TICKET_OPENED falharam #${ticketNumber}: ${
              err instanceof Error ? err.message : err
            }`,
          ),
        );

      return {
        ok: true,
        ticketNumber,
        isPreTicket,
        message: isPreTicket
          ? 'Pré-ticket criado. Atribua um responsável para concluir a abertura.'
          : 'Ticket criado com sucesso.',
        tiflux: tifluxRaw,
        portalCanonical: true,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Falha ao criar ticket.';

      if (syncToTiflux) {
        await this.appointments.recordOutbox({
          kind: PortalTifluxOutboxKind.CREATE_TICKET,
          status: PortalTifluxOutboxStatus.FAILED,
          ticketNumber: null,
          tifluxExternalId: null,
          payload,
          errorMessage: message,
          createdBy: actor.userId,
        });
      }

      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      if (error instanceof BadGatewayException) {
        throw new ServiceUnavailableException(
          error.message ||
            'Não foi possível criar o chamado (integração indisponível).',
        );
      }
      throw new InternalServerErrorException(
        message || 'Falha ao criar o chamado.',
      );
    }
  }

  async updateTicket(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    dto: UpdateTicketDto,
    files: Express.Multer.File[] = [],
  ) {
    const portal = await this.prisma.portalTicket.findUnique({
      where: { ticketNumber },
    });

    let exists = Boolean(portal);
    if (!exists) {
      try {
        const rows =
          (await this.prisma.$queryRaw<Array<{ ticket_number: number }>>`
            SELECT t.ticket_number
            FROM tiflux.tickets t
            WHERE t.ticket_number = ${ticketNumber}
            LIMIT 1
          `) ?? [];
        exists = Boolean(rows[0]);
      } catch {
        exists = false;
      }
    }

    if (!exists) {
      throw new NotFoundException('Ticket não encontrado.');
    }

    if (portal?.isClosed && dto.isClosed !== false) {
      const touchingOpenFields =
        dto.title != null ||
        dto.description != null ||
        dto.responsibleId !== undefined ||
        dto.stageName != null ||
        dto.statusName != null ||
        dto.clientId != null ||
        dto.deskId != null;
      if (touchingOpenFields) {
        throw new BadRequestException(
          'Não é possível editar um ticket fechado. Reabra o ticket antes.',
        );
      }
    }

    const writeTiflux = isTicketsTifluxWriteEnabled();
    const title = dto.title?.trim();
    const stageName = canonicalizeStageName(dto.stageName?.trim()) ?? undefined;
    const statusName =
      canonicalizeStageName(dto.statusName?.trim()) ?? undefined;
    const descriptionRaw = dto.description?.trim();

    let nextClientExternalId = portal?.clientExternalId ?? null;
    let nextClientName = portal?.clientName ?? null;
    let nextDeskExternalId = portal?.deskExternalId ?? null;
    let nextDeskName = portal?.deskName ?? null;
    if (dto.clientId != null) {
      let responsibleExternalId = portal?.responsibleExternalId ?? null;
      if (responsibleExternalId == null) {
        try {
          const rows =
            (await this.prisma.$queryRaw<
              Array<{ responsible_external_id: number | null }>
            >`
              SELECT t.responsible_external_id
              FROM tiflux.tickets t
              WHERE t.ticket_number = ${ticketNumber}
              LIMIT 1
            `) ?? [];
          responsibleExternalId = rows[0]?.responsible_external_id ?? null;
        } catch {
          responsibleExternalId = null;
        }
      }
      const canChangeClient = await this.actorCanChangeTicketClient(
        actor,
        responsibleExternalId,
      );
      if (!canChangeClient) {
        throw new ForbiddenException(
          'Somente o administrador ou o responsável do chamado podem alterar o cliente.',
        );
      }
      const company = await this.prisma.company.findFirst({
        where: { tifluxClientId: dto.clientId, deletedAt: null },
        select: { id: true, name: true, tifluxClientId: true },
      });
      if (!company?.tifluxClientId) {
        throw new BadRequestException(
          'Cliente inválido ou sem vínculo externo (tifluxClientId).',
        );
      }
      nextClientExternalId = company.tifluxClientId;
      nextClientName = company.name;
      // GMUD da empresa antiga não se aplica ao novo cliente
      await this.prisma.portalTicketGmudLink.deleteMany({
        where: { ticketNumber },
      });
    }

    if (dto.deskId != null) {
      const deskMeta = await this.resolveDeskMetaForCreate(
        dto.deskId,
        writeTiflux,
      );
      if (!deskMeta.name?.trim()) {
        throw new BadRequestException('Mesa de serviço inválida.');
      }
      nextDeskExternalId = dto.deskId;
      nextDeskName = deskMeta.name.trim();
    }

    const responsibleId =
      dto.responsibleId === undefined ? undefined : dto.responsibleId;
    let responsibleName =
      dto.responsibleName === undefined
        ? undefined
        : dto.responsibleName?.trim() || null;

    if (responsibleId != null) {
      const allowed = await this.catalogs.listResponsiblesForCatalogs();
      const match = allowed.find((r) => r.id === responsibleId);
      if (!match) {
        throw new BadRequestException(
          'O responsável selecionado não é válido (precisa estar ativo e marcado como responsável no cadastro).',
        );
      }
      if (!responsibleName) {
        responsibleName = match.name;
      }
    }

    const isRemovingResponsible =
      responsibleId === null && portal?.responsibleExternalId != null;

    const nextResponsibleIdForPreTicket =
      responsibleId !== undefined
        ? responsibleId
        : (portal?.responsibleExternalId ?? null);
    const isAssigningResponsible =
      responsibleId !== undefined &&
      responsibleId != null &&
      nextResponsibleIdForPreTicket !== (portal?.responsibleExternalId ?? null);
    const isClearingPreTicket =
      isAssigningResponsible && Boolean(portal?.isPreTicket);

    let nextOrigin = portal?.origin;

    if (writeTiflux && isClearingPreTicket && responsibleId != null) {
      await this.promotePreTicketToTiflux({
        ticketNumber,
        portal,
        title: title ?? portal?.title ?? null,
        responsibleId,
        clientExternalId:
          nextClientExternalId ?? portal?.clientExternalId ?? null,
        deskExternalId: nextDeskExternalId ?? portal?.deskExternalId ?? null,
        actorUserId: actor.userId,
      });
      nextOrigin = PortalTicketOrigin.TIFLUX;
    } else if (
      writeTiflux &&
      portal?.origin !== PortalTicketOrigin.PORTAL &&
      !isRemovingResponsible
    ) {
      const payload: Record<string, unknown> = {};
      if (title) payload.title = title;
      if (descriptionRaw) {
        payload.description = appointmentDescriptionToPlainText(descriptionRaw);
      }
      if (responsibleId !== undefined) {
        payload.responsible_id = responsibleId;
      }
      if (dto.clientId != null) {
        payload.client_id = dto.clientId;
      }
      if (dto.deskId != null) {
        payload.desk_id = dto.deskId;
      }
      if (Object.keys(payload).length > 0) {
        try {
          await this.tiflux.updateTicket(ticketNumber, payload);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Falha ao atualizar ticket.';
          // Troca de cliente no portal mesmo se TiFlux falhar (origem portal-only)
          if (dto.clientId == null) {
            throw new BadGatewayException(message);
          }
        }
      }
    }

    const reopening = portal?.isClosed && dto.isClosed === false;
    const resolvedStageName =
      stageName ??
      (reopening ? PORTAL_STAGE.NOVO : (portal?.stageName ?? null));
    const resolvedStatusName =
      statusName ??
      (reopening
        ? PORTAL_STAGE.NOVO
        : dto.isClosed === true && !statusName
          ? PORTAL_STAGE.ENCERRADO
          : (portal?.statusName ?? null));

    await this.portalStore.upsertByTicketNumber({
      ticketNumber,
      title: title ?? portal?.title ?? null,
      clientName: nextClientName,
      clientExternalId: nextClientExternalId,
      deskName: nextDeskName,
      deskExternalId: nextDeskExternalId,
      requestorName:
        dto.clientId != null ? null : (portal?.requestorName ?? null),
      requestorEmail:
        dto.clientId != null ? null : (portal?.requestorEmail ?? null),
      requestorTelephone:
        dto.clientId != null ? null : (portal?.requestorTelephone ?? null),
      priorityName: portal?.priorityName ?? null,
      createdByWayOf: portal?.createdByWayOf ?? null,
      statusName: resolvedStatusName,
      stageName: resolvedStageName,
      responsibleExternalId:
        responsibleId !== undefined
          ? responsibleId
          : (portal?.responsibleExternalId ?? null),
      responsibleName:
        responsibleName !== undefined
          ? responsibleName
          : (portal?.responsibleName ?? null),
      isClosed:
        dto.isClosed !== undefined
          ? Boolean(dto.isClosed)
          : (portal?.isClosed ?? false),
      origin: nextOrigin ?? portal?.origin,
      isPreTicket: isRemovingResponsible
        ? true
        : isClearingPreTicket
          ? false
          : responsibleId === null &&
              (portal?.responsibleExternalId ?? null) == null
            ? Boolean(portal?.isPreTicket)
            : isAssigningResponsible
              ? false
              : (portal?.isPreTicket ?? false),
      becamePreTicketAt: isRemovingResponsible
        ? new Date()
        : isClearingPreTicket || isAssigningResponsible
          ? null
          : (portal?.becamePreTicketAt ?? null),
      createdAtSource: portal?.createdAtSource ?? null,
      updatedAtSource: new Date(),
      createdBy: portal?.createdBy ?? actor.userId,
    });

    const nextIsClosed =
      dto.isClosed !== undefined
        ? Boolean(dto.isClosed)
        : (portal?.isClosed ?? false);
    const stageChanged =
      Boolean(resolvedStageName) &&
      resolvedStageName !== (portal?.stageName ?? null);
    const closedChanged = nextIsClosed !== Boolean(portal?.isClosed);
    if (stageChanged || closedChanged || reopening) {
      let eventType = 'STAGE_CHANGED';
      let summary = `Estágio atualizado para "${resolvedStageName ?? '—'}"`;
      if (reopening) {
        eventType = 'TICKET_REOPENED';
        summary = `Chamado reaberto · estágio "${resolvedStageName ?? PORTAL_STAGE.NOVO}"`;
      } else if (nextIsClosed && !portal?.isClosed) {
        eventType = 'TICKET_CLOSED';
        summary = `Chamado fechado · estágio "${resolvedStageName ?? PORTAL_STAGE.ENCERRADO}"`;
      } else if (
        resolvedStageName === PORTAL_STAGE.CANCELADO ||
        statusName === PORTAL_STAGE.CANCELADO
      ) {
        eventType = 'TICKET_CANCELLED';
        summary = 'Chamado cancelado';
      }
      try {
        await this.prisma.ticketHistory.create({
          data: {
            ticketNumber,
            eventType,
            summary,
            actorName: actor.email ?? null,
            source: 'PORTAL',
            externalKey: `${eventType.toLowerCase()}:${ticketNumber}:${Date.now()}`,
            payload: {
              fromStageName: portal?.stageName ?? null,
              toStageName: resolvedStageName,
              isClosed: nextIsClosed,
            },
            occurredAt: new Date(),
          },
        });
      } catch {
        // Histórico não deve bloquear a atualização do ticket.
      }
    }

    const nextResponsibleId =
      responsibleId !== undefined
        ? responsibleId
        : (portal?.responsibleExternalId ?? null);
    const nextResponsibleName =
      responsibleName !== undefined
        ? responsibleName
        : (portal?.responsibleName ?? null);
    const responsibleChanged =
      responsibleId !== undefined &&
      (nextResponsibleId !== (portal?.responsibleExternalId ?? null) ||
        nextResponsibleName !== (portal?.responsibleName ?? null));
    if (responsibleChanged) {
      try {
        await this.prisma.ticketHistory.create({
          data: {
            ticketNumber,
            eventType: 'RESPONSIBLE_CHANGED',
            summary: `Responsável alterado de "${portal?.responsibleName ?? '—'}" para "${nextResponsibleName ?? '—'}"`,
            actorName: actor.email ?? null,
            source: 'PORTAL',
            externalKey: `responsible_changed:${ticketNumber}:${Date.now()}`,
            payload: {
              fromResponsibleId: portal?.responsibleExternalId ?? null,
              fromResponsibleName: portal?.responsibleName ?? null,
              toResponsibleId: nextResponsibleId,
              toResponsibleName: nextResponsibleName,
            },
            occurredAt: new Date(),
          },
        });
      } catch {
        // Histórico não deve bloquear a atualização do ticket.
      }
    }

    const deskChanged =
      dto.deskId != null &&
      (nextDeskExternalId !== (portal?.deskExternalId ?? null) ||
        nextDeskName !== (portal?.deskName ?? null));
    if (deskChanged) {
      try {
        await this.prisma.ticketHistory.create({
          data: {
            ticketNumber,
            eventType: 'DESK_CHANGED',
            summary: `Chamado transferido de "${portal?.deskName ?? '—'}" para "${nextDeskName ?? '—'}"`,
            actorName: actor.email ?? null,
            source: 'PORTAL',
            externalKey: `desk_changed:${ticketNumber}:${Date.now()}`,
            payload: {
              fromDeskId: portal?.deskExternalId ?? null,
              fromDeskName: portal?.deskName ?? null,
              toDeskId: nextDeskExternalId,
              toDeskName: nextDeskName,
            },
            occurredAt: new Date(),
          },
        });
      } catch {
        // Histórico não deve bloquear a atualização do ticket.
      }
    }

    const actorName = await actorDisplayName(this.prisma, actor);
    const previousDescription = descriptionRaw
      ? await this.prisma.portalTicketDescription.findUnique({
          where: { ticketNumber },
          select: { description: true },
        })
      : null;
    const previousPlain = appointmentDescriptionToPlainText(
      previousDescription?.description ?? '',
    );
    const nextPlain = descriptionRaw
      ? appointmentDescriptionToPlainText(descriptionRaw)
      : '';

    const removeIds = (dto.removeAttachmentFileIds ?? [])
      .map((id) => id?.trim())
      .filter((id): id is string => Boolean(id));
    let removedAttachmentNames: string[] = [];
    if (removeIds.length > 0) {
      const removed =
        await this.prisma.portalTicketAppointmentAttachment.findMany({
          where: {
            ticketNumber,
            portalAppointmentId: null,
            fileId: { in: removeIds },
          },
          include: { file: { select: { originalName: true } } },
        });
      removedAttachmentNames = removed
        .map((row) => row.file.originalName.trim())
        .filter(Boolean);
    }

    if (descriptionRaw) {
      await this.savePortalTicketDescription(
        actor,
        ticketNumber,
        descriptionRaw,
        files,
      );
    }

    if (removeIds.length > 0) {
      await this.prisma.portalTicketAppointmentAttachment.deleteMany({
        where: {
          ticketNumber,
          portalAppointmentId: null,
          fileId: { in: removeIds },
        },
      });
    }

    if (descriptionRaw && previousPlain && previousPlain !== nextPlain) {
      await recordPortalTicketHistory(this.prisma, {
        ticketNumber,
        eventType: nextPlain
          ? 'COMMUNICATION_UPDATED'
          : 'COMMUNICATION_REMOVED',
        summary: nextPlain
          ? 'Comunicação do chamado alterada'
          : 'Comunicação do chamado removida',
        actorName,
        externalKey: `communication_updated:${ticketNumber}:${Date.now()}`,
        payload: {
          previousLength: previousPlain.length,
          nextLength: nextPlain.length,
        },
      });
    }

    const communicationChanged =
      descriptionRaw != null &&
      nextPlain !== previousPlain &&
      Boolean(nextPlain);
    if (communicationChanged) {
      void this.ticketAutomation
        .handleNewReply(actor, ticketNumber)
        .catch((err) =>
          this.logger.warn(
            `Automações TICKET_NEW_REPLY falharam #${ticketNumber}: ${
              err instanceof Error ? err.message : err
            }`,
          ),
        );
    }

    if (removedAttachmentNames.length > 0) {
      const names = removedAttachmentNames.slice(0, 3).join(', ');
      const extra =
        removedAttachmentNames.length > 3
          ? ` e mais ${removedAttachmentNames.length - 3}`
          : '';
      await recordPortalTicketHistory(this.prisma, {
        ticketNumber,
        eventType: 'COMMUNICATION_REMOVED',
        summary: `Anexo(s) removido(s) da comunicação: ${names}${extra}`,
        actorName,
        externalKey: `communication_removed:${ticketNumber}:${Date.now()}`,
        payload: {
          fileIds: removeIds,
          names: removedAttachmentNames,
        },
      });
    }

    if (stageName) {
      try {
        await this.prisma.$executeRawUnsafe(
          `
          UPDATE tiflux.tickets
          SET stage_name = $2::text
          WHERE ticket_number = $1
        `,
          ticketNumber,
          stageName,
        );
      } catch {
        // Mirror pode estar ausente no cutover local.
      }
    }

    if (responsibleId !== undefined) {
      try {
        await this.prisma.$executeRaw`
          UPDATE tiflux.tickets
          SET responsible_external_id = ${nextResponsibleId},
              responsible_name = ${nextResponsibleName}
          WHERE ticket_number = ${ticketNumber}
        `;
      } catch {
        // Mirror pode estar ausente no cutover local.
      }
    }

    if (dto.deskId != null) {
      try {
        await this.prisma.$executeRaw`
          UPDATE tiflux.tickets
          SET desk_external_id = ${nextDeskExternalId},
              desk_name = ${nextDeskName}
          WHERE ticket_number = ${ticketNumber}
        `;
      } catch {
        // Mirror pode estar ausente no cutover local.
      }
    }

    return {
      ok: true,
      ticketNumber,
      isPreTicket: isRemovingResponsible
        ? true
        : isClearingPreTicket
          ? false
          : (portal?.isPreTicket ?? false),
      message: isRemovingResponsible
        ? 'Responsável removido. O ticket voltou para triagem como pré-ticket; apontamentos e histórico foram preservados.'
        : dto.deskId != null
          ? `Ticket transferido para o catálogo "${nextDeskName}".`
          : isClearingPreTicket
            ? 'Responsável atribuído. Ticket sincronizado com TiFlux.'
            : writeTiflux && nextOrigin !== PortalTicketOrigin.PORTAL
              ? 'Ticket atualizado.'
              : 'Ticket atualizado no portal.',
    };
  }

  async groupIntoParent(
    actor: AuthenticatedRequestUser,
    childTicketNumber: number,
    parentTicketNumber: number,
  ) {
    if (childTicketNumber === parentTicketNumber) {
      throw new BadRequestException(
        'Selecione outro chamado para agrupar. Não é possível agrupar um ticket nele mesmo.',
      );
    }

    const [child, parent] = await Promise.all([
      this.prisma.portalTicket.findUnique({
        where: { ticketNumber: childTicketNumber },
      }),
      this.prisma.portalTicket.findUnique({
        where: { ticketNumber: parentTicketNumber },
      }),
    ]);

    if (!child) {
      throw new NotFoundException('Chamado atual não encontrado no portal.');
    }
    if (!parent) {
      throw new NotFoundException(
        'Chamado pai não encontrado. Informe um número válido.',
      );
    }
    if (child.parentTicketNumber === parentTicketNumber) {
      return {
        ok: true,
        ticketNumber: childTicketNumber,
        parentTicketNumber,
        message: `Este chamado já está agrupado em #${parentTicketNumber}.`,
      };
    }

    let cursor = parent.parentTicketNumber;
    const seen = new Set<number>([childTicketNumber, parentTicketNumber]);
    while (cursor != null) {
      if (seen.has(cursor)) {
        throw new BadRequestException(
          'Não é possível agrupar: os chamados formariam um ciclo.',
        );
      }
      seen.add(cursor);
      const next = await this.prisma.portalTicket.findUnique({
        where: { ticketNumber: cursor },
        select: { parentTicketNumber: true },
      });
      cursor = next?.parentTicketNumber ?? null;
    }

    const occurredAt = new Date();
    await this.prisma.$transaction([
      this.prisma.portalTicket.update({
        where: { ticketNumber: childTicketNumber },
        data: {
          parentTicketNumber,
          isClosed: true,
          stageName: PORTAL_STAGE.CANCELADO,
          statusName: PORTAL_STAGE.CANCELADO,
          updatedAtSource: occurredAt,
        },
      }),
      this.prisma.ticketHistory.create({
        data: {
          ticketNumber: childTicketNumber,
          eventType: 'TICKET_GROUPED',
          summary: `Agrupado no chamado #${parentTicketNumber} e cancelado`,
          actorName: actor.email ?? null,
          source: 'PORTAL',
          externalKey: `grouped:${childTicketNumber}:${parentTicketNumber}:${occurredAt.getTime()}`,
          payload: {
            parentTicketNumber,
            parentTitle: parent.title,
            childTicketNumber,
          },
          occurredAt,
        },
      }),
      this.prisma.ticketHistory.create({
        data: {
          ticketNumber: parentTicketNumber,
          eventType: 'TICKET_GROUPED',
          summary: `Chamado #${childTicketNumber} agrupado neste ticket (filho cancelado)`,
          actorName: actor.email ?? null,
          source: 'PORTAL',
          externalKey: `group-parent:${parentTicketNumber}:${childTicketNumber}:${occurredAt.getTime()}`,
          payload: {
            childTicketNumber,
            childTitle: child.title,
            parentTicketNumber,
          },
          occurredAt,
        },
      }),
    ]);

    try {
      await this.prisma.$executeRaw`
        UPDATE tiflux.tickets
        SET stage_name = ${PORTAL_STAGE.CANCELADO},
            status_name = ${PORTAL_STAGE.CANCELADO},
            is_closed = true
        WHERE ticket_number = ${childTicketNumber}
      `;
    } catch {
      // Mirror pode estar ausente no cutover local.
    }

    return {
      ok: true,
      ticketNumber: childTicketNumber,
      parentTicketNumber,
      message: `Chamado #${childTicketNumber} agrupado em #${parentTicketNumber} e cancelado.`,
    };
  }

  /** Pré-ticket portal-only → ticket TiFlux ao atribuir responsável (modo híbrido WRITE=true). */
  private async promotePreTicketToTiflux(input: {
    ticketNumber: number;
    portal: {
      title: string | null;
      clientExternalId: number | null;
      deskExternalId: number | null;
      requestorName: string | null;
      requestorEmail: string | null;
      requestorTelephone: string | null;
    } | null;
    title: string | null;
    responsibleId: number;
    clientExternalId: number | null;
    deskExternalId: number | null;
    actorUserId: string;
  }) {
    const clientId = input.clientExternalId;
    const deskId = input.deskExternalId;
    if (clientId == null || !Number.isFinite(clientId)) {
      throw new BadRequestException(
        'Cliente sem vínculo externo (tifluxClientId). Não foi possível sincronizar com TiFlux.',
      );
    }
    if (deskId == null || !Number.isFinite(deskId)) {
      throw new BadRequestException(
        'Catálogo sem vínculo externo. Não foi possível sincronizar com TiFlux.',
      );
    }

    const descRow = await this.prisma.portalTicketDescription.findUnique({
      where: { ticketNumber: input.ticketNumber },
      select: { description: true },
    });
    const descriptionPlain = appointmentDescriptionToPlainText(
      descRow?.description ?? '',
    );

    const payload = {
      title: (input.title ?? input.portal?.title ?? 'Ticket').trim(),
      description: descriptionPlain || '(sem descrição)',
      client_id: clientId,
      desk_id: deskId,
      responsible_id: input.responsibleId,
      requestor_name: input.portal?.requestorName?.trim() || 'Solicitante',
      requestor_email: input.portal?.requestorEmail?.trim() || undefined,
      requestor_telephone:
        input.portal?.requestorTelephone?.trim() || undefined,
    };

    const raw = await this.tiflux.createTicket(payload);
    const tifluxNumber = Number(
      (raw as { ticket?: { ticket_number?: number } })?.ticket?.ticket_number,
    );
    if (!Number.isFinite(tifluxNumber)) {
      throw new BadGatewayException(
        'Não foi possível obter o número do ticket criado no TiFlux.',
      );
    }
    if (tifluxNumber !== input.ticketNumber) {
      this.logger.warn(
        `Promote pré-ticket #${input.ticketNumber}: TiFlux retornou #${tifluxNumber}`,
      );
    }

    await this.appointments.recordOutbox({
      kind: PortalTifluxOutboxKind.CREATE_TICKET,
      status: PortalTifluxOutboxStatus.SYNCED,
      ticketNumber: input.ticketNumber,
      tifluxExternalId: null,
      payload,
      errorMessage: null,
      createdBy: input.actorUserId,
    });
  }

  private async savePortalTicketDescription(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    descriptionRaw: string,
    files: Express.Multer.File[],
  ) {
    const attachments = await this.appointments.saveAppointmentFiles(
      actor,
      ticketNumber,
      files,
      null,
      null,
      null,
    );

    const savedImages: SavedAppointmentImage[] = attachments
      .filter((item): item is typeof item & { base64: string } =>
        Boolean(item.base64?.trim()),
      )
      .map((item) => ({
        fileId: item.fileId,
        mimeType: item.mimeType,
        base64: item.base64,
      }));

    let description = descriptionRaw;
    if (savedImages.length > 0) {
      description = enrichAppointmentDescriptionWithImages(
        descriptionRaw,
        savedImages,
      );
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
  }
}
