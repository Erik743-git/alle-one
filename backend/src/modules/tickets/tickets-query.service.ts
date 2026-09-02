import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { TenantScopeService } from '../../common/security/tenant-scope.service';
import { isClientPortalRole } from '../../common/security/client-portal-role';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { AuditService } from '../audit/audit.service';
import { TifluxService } from '../tiflux/tiflux.service';
import type { TicketsListQueryDto } from './tickets.dto';
import {
  PORTAL_DONE_STAGES,
  isDonePortalStage,
  PORTAL_STAGES_ORDER,
} from './portal-ticket-stages';
import {
  canonicalizeStageName,
  resolveTicketStageGroup,
  TICKET_STAGE_GROUPS,
  type TicketStageGroupKey,
} from './tickets-stage-groups';
import { normalizeDeskName } from './tiflux-portal-desk.config';
import {
  TicketsAppointmentsService,
  type TicketAppointmentDto,
} from './tickets-appointments.service';
import {
  assertTicketClientScope,
  buildPortalMineOnlyOr,
  resolveClientListFilter,
} from './tickets-client-scope';
import { portalResponsibleSyntheticId } from './portal-responsible.helper';
import {
  isTicketsPortalCanonical,
  isTicketsTifluxWriteEnabled,
  isTifluxDisconnected,
  isTifluxRuntimeApiEnabled,
} from './tickets-portal.config';
import { TicketsPortalStoreService } from './tickets-portal-store.service';
import { TicketAutomationService } from './ticket-automation.service';

type TicketRow = {
  ticket_number: number;
  title: string | null;
  client_name: string | null;
  client_external_id: number | null;
  created_by_way_of: string | null;
  priority_name: string | null;
  status_name: string | null;
  stage_name: string | null;
  responsible_external_id: number | null;
  responsible_name: string | null;
  desk_name: string | null;
  desk_external_id: number | null;
  created_at_source: Date | null;
  updated_at_source: Date | null;
  is_closed: boolean | null;
  external_gmud_ref?: string | null;
};

type AppointmentRow = {
  external_id: number;
  ticket_number: number;
  appointment_date: Date | null;
  init_time: Date | null;
  end_time: Date | null;
  user_external_id: number | null;
  user_name: string | null;
  description: string | null;
  valorization_raw: unknown;
};

export type TicketListItemDto = {
  ticketNumber: number;
  title: string | null;
  clientName: string | null;
  origin: string | null;
  priorityName: string | null;
  statusName: string | null;
  stageName: string | null;
  responsibleExternalId: number | null;
  responsibleName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  stageGroup: TicketStageGroupKey;
  externalGmudRef: string | null;
  isPreTicket?: boolean;
};

export type TicketHistoryDto = {
  id: string;
  eventType: string;
  summary: string;
  actorName: string | null;
  createdAt: string;
};

export type TicketGroupingDto = {
  parent: {
    ticketNumber: number;
    title: string | null;
    isClosed: boolean;
  } | null;
  children: Array<{
    ticketNumber: number;
    title: string | null;
    isClosed: boolean;
    stageName: string | null;
  }>;
};

@Injectable()
export class TicketsQueryService {
  private readonly logger = new Logger(TicketsQueryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tiflux: TifluxService,
    private readonly audit: AuditService,
    private readonly tenantScope: TenantScopeService,
    private readonly appointments: TicketsAppointmentsService,
    private readonly portalStore: TicketsPortalStoreService,
    @Inject(forwardRef(() => TicketAutomationService))
    private readonly ticketAutomation: TicketAutomationService,
  ) {}

  private get allowRuntimeTifluxApi(): boolean {
    return isTifluxRuntimeApiEnabled();
  }

  private formatTime(value: Date | null): string | null {
    if (!value) return null;
    const h = value.getUTCHours();
    const m = value.getUTCMinutes();
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private formatDateOnly(value: Date | null): string | null {
    if (!value) return null;
    const y = value.getUTCFullYear();
    const mo = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }

  private toIso(value: Date | null): string | null {
    if (!value) return null;
    return value.toISOString();
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private async actorCanChangeTicketClient(
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

  private mapListItem(row: TicketRow): TicketListItemDto {
    return {
      ticketNumber: Number(row.ticket_number),
      title: row.title,
      clientName: row.client_name,
      origin: row.created_by_way_of,
      priorityName: row.priority_name,
      statusName: row.status_name,
      stageName: canonicalizeStageName(row.stage_name) ?? row.stage_name,
      responsibleExternalId:
        row.responsible_external_id != null
          ? Number(row.responsible_external_id)
          : null,
      responsibleName: row.responsible_name,
      createdAt: this.toIso(row.created_at_source),
      updatedAt: this.toIso(row.updated_at_source),
      stageGroup: resolveTicketStageGroup(row.stage_name),
      externalGmudRef: row.external_gmud_ref?.trim() || null,
    };
  }

  private async loadTicketGrouping(
    ticketNumber: number,
  ): Promise<TicketGroupingDto> {
    const empty: TicketGroupingDto = { parent: null, children: [] };
    try {
      const portal = await this.prisma.portalTicket.findUnique({
        where: { ticketNumber },
        select: { parentTicketNumber: true },
      });
      if (!portal) return empty;
      const [parent, children] = await Promise.all([
        portal.parentTicketNumber != null
          ? this.prisma.portalTicket.findUnique({
              where: { ticketNumber: portal.parentTicketNumber },
              select: { ticketNumber: true, title: true, isClosed: true },
            })
          : Promise.resolve(null),
        this.prisma.portalTicket.findMany({
          where: { parentTicketNumber: ticketNumber },
          select: {
            ticketNumber: true,
            title: true,
            isClosed: true,
            stageName: true,
          },
          orderBy: { ticketNumber: 'asc' },
          take: 50,
        }),
      ]);
      return {
        parent: parent
          ? {
              ticketNumber: parent.ticketNumber,
              title: parent.title,
              isClosed: parent.isClosed,
            }
          : null,
        children,
      };
    } catch {
      return empty;
    }
  }

  /** Leitura canônica a partir de `portal_tickets` (flag TICKETS_PORTAL_CANONICAL). */
  private async listGroupedFromPortal(
    actor: AuthenticatedRequestUser,
    query: TicketsListQueryDto,
  ) {
    const limit = Math.min(Math.max(query.limit ?? 500, 1), 1000);
    const clientScope = await this.resolveClientListFilter(
      actor,
      query.clientExternalId,
    );
    const mineOnly = clientScope.mineOnlyForcedOn
      ? true
      : clientScope.mineOnlyForcedOff
        ? false
        : query.mineOnly !== false;
    const clientExternalIdFilter = clientScope.clientExternalId;
    const alleClientExternalId = clientScope.alleClientExternalId;

    let responsibleFilter: number | null = null;
    let responsibleName: string | null = null;
    const actorEmail = this.normalizeEmail(actor.email);

    if (mineOnly) {
      const mine = await this.resolveTifluxExternalIdForUser(actor.email);
      if (mine) {
        responsibleFilter = mine.externalId;
        responsibleName = mine.name;
      } else {
        responsibleName = actor.email;
      }
    } else {
      responsibleFilter = query.responsibleExternalId ?? null;
    }

    const fromDate = query.from?.trim()
      ? new Date(`${query.from}T00:00:00`)
      : null;
    const toDate = query.to?.trim() ? new Date(`${query.to}T23:59:59`) : null;
    const search = query.search?.trim() ?? '';

    const watcherTicketNumbers = mineOnly
      ? (
          await this.prisma.portalTicketWatcher.findMany({
            where: { email: actorEmail },
            select: { ticketNumber: true },
          })
        ).map((w) => w.ticketNumber)
      : [];

    const andParts: Prisma.PortalTicketWhereInput[] = [];
    if (mineOnly) {
      const mineOr = buildPortalMineOnlyOr({
        actorUserId: actor.userId,
        actorEmail,
        responsibleExternalId: responsibleFilter,
        responsibleDisplayName: responsibleName,
        watcherTicketNumbers,
      });
      andParts.push({ OR: mineOr });
    }
    if (search) {
      andParts.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          ...(Number.isFinite(Number(search))
            ? [{ ticketNumber: Number(search) }]
            : []),
        ],
      });
    }

    let clientWhere: Prisma.PortalTicketWhereInput | undefined;
    if (clientExternalIdFilter != null) {
      const includeAlle =
        alleClientExternalId != null &&
        Number(alleClientExternalId) !== Number(clientExternalIdFilter) &&
        isClientPortalRole(actor.role);

      if (includeAlle && mineOnly) {
        clientWhere = {
          clientExternalId: {
            in: [clientExternalIdFilter, alleClientExternalId],
          },
        };
      } else if (includeAlle && !mineOnly && actor.companyId) {
        const companyUsers = await this.prisma.user.findMany({
          where: {
            deletedAt: null,
            OR: [
              { companyId: actor.companyId },
              {
                companyMemberships: {
                  some: { companyId: actor.companyId },
                },
              },
            ],
          },
          select: { id: true },
          take: 5000,
        });
        const companyUserIds = companyUsers.map((u) => u.id);
        clientWhere = {
          OR: [
            { clientExternalId: clientExternalIdFilter },
            {
              clientExternalId: alleClientExternalId,
              createdBy: { in: companyUserIds },
            },
          ],
        };
      } else {
        clientWhere = { clientExternalId: clientExternalIdFilter };
      }
    }

    const includeDone =
      query.includeDone === true ||
      query.ticketNumber != null ||
      (/^\d+$/.test(search) && search.length > 0) ||
      isDonePortalStage(query.stageName);

    if (!includeDone) {
      andParts.push({ isClosed: false });
      andParts.push({
        OR: [
          { stageName: null },
          {
            NOT: {
              OR: PORTAL_DONE_STAGES.map((stage) => ({
                stageName: {
                  equals: stage,
                  mode: 'insensitive' as const,
                },
              })),
            },
          },
        ],
      });
    }

    const rows = await this.prisma.portalTicket.findMany({
      where: {
        ...(!mineOnly && responsibleFilter != null
          ? { responsibleExternalId: responsibleFilter }
          : {}),
        ...(clientWhere ?? {}),
        ...(query.stageName
          ? { stageName: { contains: query.stageName, mode: 'insensitive' } }
          : {}),
        ...(query.statusName
          ? { statusName: { contains: query.statusName, mode: 'insensitive' } }
          : {}),
        ...(query.deskName
          ? { deskName: { contains: query.deskName, mode: 'insensitive' } }
          : {}),
        ...(query.requestorName
          ? {
              OR: [
                {
                  requestorName: {
                    contains: query.requestorName,
                    mode: 'insensitive',
                  },
                },
                {
                  requestorEmail: {
                    contains: query.requestorName,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
        ...(query.ticketNumber != null
          ? { ticketNumber: query.ticketNumber }
          : {}),
        ...(fromDate || toDate
          ? {
              createdAtSource: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
        ...(andParts.length > 0 ? { AND: andParts } : {}),
      },
      orderBy: [{ updatedAtSource: 'desc' }, { ticketNumber: 'desc' }],
      take: limit,
    });

    const gmudRefs = await this.prisma.portalTicketGmudLink.findMany({
      where: { ticketNumber: { in: rows.map((r) => r.ticketNumber) } },
      select: { ticketNumber: true, externalGmudRef: true },
    });
    const gmudByTicket = new Map(
      gmudRefs.map((g) => [g.ticketNumber, g.externalGmudRef]),
    );

    const ticketRows: TicketRow[] = rows.map((r) => ({
      ticket_number: r.ticketNumber,
      title: r.title,
      client_name: r.clientName,
      client_external_id: r.clientExternalId,
      created_by_way_of: r.createdByWayOf,
      priority_name: r.priorityName,
      status_name: r.statusName,
      stage_name: r.stageName,
      responsible_external_id: r.responsibleExternalId,
      responsible_name: r.responsibleName,
      desk_name: r.deskName,
      desk_external_id: r.deskExternalId,
      created_at_source: r.createdAtSource,
      updated_at_source: r.updatedAtSource,
      is_closed: r.isClosed,
      external_gmud_ref: gmudByTicket.get(r.ticketNumber) ?? null,
    }));

    const groupedMap = new Map<TicketStageGroupKey, TicketListItemDto[]>();
    for (const def of TICKET_STAGE_GROUPS) {
      groupedMap.set(def.key, []);
    }
    for (const row of ticketRows) {
      const item = this.mapListItem(row);
      groupedMap.get(item.stageGroup)?.push(item);
    }

    const groups = TICKET_STAGE_GROUPS.map((def) => ({
      key: def.key,
      label: def.label,
      tickets: groupedMap.get(def.key) ?? [],
    })).filter((g) => g.tickets.length > 0);

    return {
      total: ticketRows.length,
      mineOnly,
      responsibleExternalId: responsibleFilter,
      responsibleName,
      tifluxUserResolved: responsibleFilter != null || !mineOnly,
      message: mineOnly ? 'Filtrando pelos seus tickets.' : null,
      groups,
      source: 'portal_tickets',
    };
  }

  private buildDetailSummary(appointments: TicketAppointmentDto[]) {
    const totalMinutes = appointments.reduce((sum, a) => sum + a.minutes, 0);
    const attendants = new Set(
      appointments.map((a) => a.userName).filter(Boolean),
    );

    return {
      attendantsCount: attendants.size,
      totalMinutes,
      totalHoursFormatted: `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`,
      appointmentsCount: appointments.length,
    };
  }

  private async getDetailFromTifluxApi(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
  ) {
    const apiTicket = await this.tiflux.getTicket(ticketNumber);
    if (!apiTicket) {
      throw new NotFoundException('Ticket não encontrado.');
    }

    await this.assertTicketClientScope(actor, apiTicket.client?.id ?? null, {
      requestorEmail:
        typeof apiTicket.requestor?.email === 'string'
          ? apiTicket.requestor.email
          : null,
    });

    const [appointments, externalGmudRef, portalDescription, grouping] =
      await Promise.all([
        this.appointments.listMergedAppointments(ticketNumber, actor),
        this.loadExternalGmudRef(ticketNumber),
        this.loadPortalTicketDescription(ticketNumber),
        this.loadTicketGrouping(ticketNumber),
      ]);

    const stageName = apiTicket.stage?.name ?? null;
    const createdByWayOf =
      typeof apiTicket.created_by_way_of === 'string'
        ? apiTicket.created_by_way_of
        : null;

    return {
      ticket: {
        ticketNumber: apiTicket.ticket_number,
        title: apiTicket.title ?? null,
        clientName: apiTicket.client?.name ?? null,
        clientExternalId: apiTicket.client?.id ?? null,
        origin: createdByWayOf,
        priorityName: apiTicket.priority?.name ?? null,
        statusName: apiTicket.status?.name ?? null,
        stageName,
        responsibleExternalId: apiTicket.responsible?.id ?? null,
        responsibleName: apiTicket.responsible?.name ?? null,
        deskName: apiTicket.desk?.name ?? null,
        deskExternalId: apiTicket.desk?.id ?? null,
        createdAt: apiTicket.created_at ?? null,
        updatedAt: apiTicket.updated_at ?? null,
        isClosed: Boolean(apiTicket.is_closed),
        requestorName: apiTicket.requestor?.name ?? null,
        requestorEmail: apiTicket.requestor?.email ?? null,
        requestorTelephone: apiTicket.requestor?.telephone ?? null,
        stageGroup: resolveTicketStageGroup(stageName),
        externalGmudRef: externalGmudRef?.trim() || null,
      },
      summary: this.buildDetailSummary(appointments),
      appointments,
      externalGmudRef,
      portalDescription,
      syncPending: true,
      grouping,
      canChangeClient: await this.actorCanChangeTicketClient(
        actor,
        apiTicket.responsible?.id ?? null,
      ),
    };
  }

  private async loadExternalGmudRef(ticketNumber: number) {
    const link = await this.prisma.portalTicketGmudLink.findUnique({
      where: { ticketNumber },
      select: { externalGmudRef: true },
    });
    const ref = link?.externalGmudRef?.trim();
    return ref || null;
  }

  private async loadTifluxRequestorMeta(ticketNumber: number): Promise<{
    requestorName: string | null;
    requestorEmail: string | null;
    requestorTelephone: string | null;
  } | null> {
    try {
      const rows =
        (await this.prisma.$queryRaw<
          Array<{
            requestor_name: string | null;
            requestor_email: string | null;
            requestor_telephone: string | null;
          }>
        >`
          SELECT
            t.requestor_name,
            t.requestor_email,
            t.requestor_telephone
          FROM tiflux.tickets t
          WHERE t.ticket_number = ${ticketNumber}
          LIMIT 1
        `) ?? [];
      const row = rows[0];
      if (!row) return null;
      return {
        requestorName: row.requestor_name,
        requestorEmail: row.requestor_email,
        requestorTelephone: row.requestor_telephone,
      };
    } catch {
      return null;
    }
  }

  /** CLIENT só acessa tickets do cliente TiFlux da própria empresa (ou Alle se envolvido). */
  private async assertTicketClientScope(
    actor: AuthenticatedRequestUser,
    clientExternalId: number | null | undefined,
    involvement?: {
      createdBy?: string | null;
      requestorEmail?: string | null;
    },
  ) {
    return assertTicketClientScope(
      this.tenantScope,
      actor,
      clientExternalId,
      involvement,
    );
  }

  private async resolveClientListFilter(
    actor: AuthenticatedRequestUser,
    requestedClientId: number | null | undefined,
  ) {
    return resolveClientListFilter(this.tenantScope, actor, requestedClientId);
  }

  async listGrouped(
    actor: AuthenticatedRequestUser,
    query: TicketsListQueryDto,
  ) {
    if (isTicketsPortalCanonical()) {
      return this.listGroupedFromPortal(actor, query);
    }

    const limit = Math.min(Math.max(query.limit ?? 500, 1), 1000);
    const clientScope = await this.resolveClientListFilter(
      actor,
      query.clientExternalId,
    );
    const mineOnly = clientScope.mineOnlyForcedOn
      ? true
      : clientScope.mineOnlyForcedOff
        ? false
        : query.mineOnly !== false;
    const clientExternalIdFilter = clientScope.clientExternalId;

    let responsibleFilter: number | null = null;
    let responsibleName: string | null = null;
    const search = query.search?.trim() ?? '';
    const ticketNumberFilter = query.ticketNumber ?? null;
    const includeDone =
      query.includeDone === true ||
      ticketNumberFilter != null ||
      (/^\d+$/.test(search) && search.length > 0) ||
      isDonePortalStage(query.stageName);

    if (mineOnly) {
      const mine = await this.resolveTifluxExternalIdForUser(actor.email);
      if (!mine) {
        // Sem TiFlux: ainda inclui tickets em que o usuário está em cópia (seguidor).
        const watched = await this.prisma.portalTicketWatcher.findMany({
          where: { email: this.normalizeEmail(actor.email) },
          select: { ticketNumber: true },
        });
        const watchedNumbers = watched.map((w) => w.ticketNumber);
        if (watchedNumbers.length === 0) {
          return {
            total: 0,
            mineOnly: true,
            responsibleExternalId: null,
            responsibleName: null,
            tifluxUserResolved: false,
            message:
              'Não foi possível identificar seus tickets automaticamente. Use a busca avançada para consultar outros tickets.',
            groups: [],
          };
        }
        const portalRows = await this.prisma.portalTicket.findMany({
          where: {
            ...(includeDone ? {} : { isClosed: false }),
            ticketNumber: { in: watchedNumbers },
          },
          orderBy: [{ updatedAtSource: 'desc' }, { ticketNumber: 'desc' }],
          take: limit,
        });
        const groupedMap = new Map<TicketStageGroupKey, TicketListItemDto[]>();
        for (const def of TICKET_STAGE_GROUPS) {
          groupedMap.set(def.key, []);
        }
        for (const r of portalRows) {
          const item = this.mapListItem({
            ticket_number: r.ticketNumber,
            title: r.title,
            client_name: r.clientName,
            client_external_id: r.clientExternalId,
            created_by_way_of: r.createdByWayOf,
            priority_name: r.priorityName,
            status_name: r.statusName,
            stage_name: r.stageName,
            responsible_external_id: r.responsibleExternalId,
            responsible_name: r.responsibleName,
            desk_name: r.deskName,
            desk_external_id: r.deskExternalId,
            created_at_source: r.createdAtSource,
            updated_at_source: r.updatedAtSource,
            is_closed: r.isClosed,
            external_gmud_ref: null,
          });
          groupedMap.get(item.stageGroup)?.push(item);
        }
        return {
          total: portalRows.length,
          mineOnly: true,
          responsibleExternalId: null,
          responsibleName: actor.email,
          tifluxUserResolved: false,
          message: 'Exibindo chamados em que você está em cópia.',
          groups: TICKET_STAGE_GROUPS.map((def) => ({
            key: def.key,
            label: def.label,
            tickets: groupedMap.get(def.key) ?? [],
          })).filter((g) => g.tickets.length > 0),
        };
      }
      responsibleFilter = mine.externalId;
      responsibleName = mine.name;
    } else {
      responsibleFilter = query.responsibleExternalId ?? null;
      if (responsibleFilter != null) {
        const rows =
          (await this.prisma.$queryRaw<Array<{ name: string | null }>>`
            SELECT tu.name
            FROM tiflux.users tu
            WHERE tu.external_id = ${responsibleFilter}
            LIMIT 1
          `) ?? [];
        responsibleName = rows[0]?.name ?? null;
      }
    }

    const fromDate = query.from?.trim()
      ? new Date(`${query.from}T00:00:00`)
      : null;
    const toDate = query.to?.trim() ? new Date(`${query.to}T23:59:59`) : null;
    const externalGmudRefFilter = query.externalGmudRef?.trim() ?? '';

    const actorEmail = this.normalizeEmail(actor.email);

    const rows = mineOnly
      ? ((await this.prisma.$queryRaw<TicketRow[]>`
            SELECT
              t.ticket_number,
              t.title,
              t.client_name,
              t.client_external_id,
              t.created_by_way_of,
              t.priority_name,
              t.status_name,
              t.stage_name,
              t.responsible_external_id,
              t.responsible_name,
              t.desk_name,
              t.created_at_source,
              t.updated_at_source,
              t.is_closed,
              l.external_gmud_ref
            FROM tiflux.tickets t
            LEFT JOIN portal_ticket_gmud_links l ON l.ticket_number = t.ticket_number
            WHERE (
                ${includeDone}::boolean = true
                OR (
                  COALESCE(t.is_closed, false) = false
                  AND (
                    t.stage_name IS NULL
                    OR lower(trim(t.stage_name)) NOT IN (
                      'resolvido', 'encerrado', 'cancelado'
                    )
                  )
                )
              )
              AND (
                t.responsible_external_id = ${responsibleFilter}
                OR (
                  ${responsibleName ?? ''}::text <> ''
                  AND lower(trim(t.responsible_name)) = lower(trim(${responsibleName ?? ''}))
                )
                OR EXISTS (
                  SELECT 1
                  FROM portal_ticket_watchers w
                  WHERE w.ticket_number = t.ticket_number
                    AND lower(w.email) = ${actorEmail}
                )
              )
              AND (${clientExternalIdFilter ?? null}::int IS NULL OR t.client_external_id = ${clientExternalIdFilter ?? null})
              AND (${query.stageName ?? null}::text IS NULL OR t.stage_name ILIKE ${query.stageName ? `%${query.stageName}%` : null})
              AND (${query.statusName ?? null}::text IS NULL OR t.status_name ILIKE ${query.statusName ? `%${query.statusName}%` : null})
              AND (${query.deskName ?? null}::text IS NULL OR t.desk_name ILIKE ${query.deskName ? `%${query.deskName}%` : null})
              AND (${fromDate}::timestamptz IS NULL OR t.created_at_source >= ${fromDate})
              AND (${toDate}::timestamptz IS NULL OR t.created_at_source <= ${toDate})
              AND (${ticketNumberFilter}::int IS NULL OR t.ticket_number = ${ticketNumberFilter})
              AND (${externalGmudRefFilter}::text = '' OR l.external_gmud_ref ILIKE ${externalGmudRefFilter ? `%${externalGmudRefFilter}%` : ''})
              AND (
                ${search}::text = ''
                OR t.title ILIKE ${search ? `%${search}%` : ''}
                OR CAST(t.ticket_number AS text) ILIKE ${search ? `%${search}%` : ''}
              )
            ORDER BY t.updated_at_source DESC NULLS LAST, t.ticket_number DESC
            LIMIT ${limit}
          `) ?? [])
      : ((await this.prisma.$queryRaw<TicketRow[]>`
            SELECT
              t.ticket_number,
              t.title,
              t.client_name,
              t.client_external_id,
              t.created_by_way_of,
              t.priority_name,
              t.status_name,
              t.stage_name,
              t.responsible_external_id,
              t.responsible_name,
              t.desk_name,
              t.created_at_source,
              t.updated_at_source,
              t.is_closed,
              l.external_gmud_ref
            FROM tiflux.tickets t
            LEFT JOIN portal_ticket_gmud_links l ON l.ticket_number = t.ticket_number
            WHERE (
                ${includeDone}::boolean = true
                OR (
                  COALESCE(t.is_closed, false) = false
                  AND (
                    t.stage_name IS NULL
                    OR lower(trim(t.stage_name)) NOT IN (
                      'resolvido', 'encerrado', 'cancelado'
                    )
                  )
                )
              )
              AND (${responsibleFilter}::int IS NULL OR t.responsible_external_id = ${responsibleFilter})
              AND (${clientExternalIdFilter ?? null}::int IS NULL OR t.client_external_id = ${clientExternalIdFilter ?? null})
              AND (${query.stageName ?? null}::text IS NULL OR t.stage_name ILIKE ${query.stageName ? `%${query.stageName}%` : null})
              AND (${query.statusName ?? null}::text IS NULL OR t.status_name ILIKE ${query.statusName ? `%${query.statusName}%` : null})
              AND (${query.deskName ?? null}::text IS NULL OR t.desk_name ILIKE ${query.deskName ? `%${query.deskName}%` : null})
              AND (${fromDate}::timestamptz IS NULL OR t.created_at_source >= ${fromDate})
              AND (${toDate}::timestamptz IS NULL OR t.created_at_source <= ${toDate})
              AND (${ticketNumberFilter}::int IS NULL OR t.ticket_number = ${ticketNumberFilter})
              AND (${externalGmudRefFilter}::text = '' OR l.external_gmud_ref ILIKE ${externalGmudRefFilter ? `%${externalGmudRefFilter}%` : ''})
              AND (
                ${search}::text = ''
                OR t.title ILIKE ${search ? `%${search}%` : ''}
                OR CAST(t.ticket_number AS text) ILIKE ${search ? `%${search}%` : ''}
              )
            ORDER BY t.updated_at_source DESC NULLS LAST, t.ticket_number DESC
            LIMIT ${limit}
          `) ?? []);

    const seenTicketNumbers = new Set<number>();
    const uniqueRows = rows.filter((row) => {
      const ticketNumber = Number(row.ticket_number);
      if (
        !Number.isFinite(ticketNumber) ||
        seenTicketNumbers.has(ticketNumber)
      ) {
        return false;
      }
      seenTicketNumbers.add(ticketNumber);
      return true;
    });

    const groupedMap = new Map<TicketStageGroupKey, TicketListItemDto[]>();
    for (const def of TICKET_STAGE_GROUPS) {
      groupedMap.set(def.key, []);
    }

    for (const row of uniqueRows) {
      const item = this.mapListItem(row);
      groupedMap.get(item.stageGroup)?.push(item);
    }

    const groups = TICKET_STAGE_GROUPS.map((def) => ({
      key: def.key,
      label: def.label,
      tickets: groupedMap.get(def.key) ?? [],
    })).filter((g) => g.tickets.length > 0);

    return {
      total: uniqueRows.length,
      mineOnly,
      responsibleExternalId: responsibleFilter,
      responsibleName,
      tifluxUserResolved: true,
      message: null,
      groups,
    };
  }

  async getDetail(actor: AuthenticatedRequestUser, ticketNumber: number) {
    if (
      !Number.isSafeInteger(ticketNumber) ||
      ticketNumber < 1 ||
      ticketNumber > 2147483647
    ) {
      throw new NotFoundException('Chamado não encontrado.');
    }
    const portal = await this.prisma.portalTicket.findUnique({
      where: { ticketNumber },
    });
    if (portal) {
      await this.assertTicketClientScope(actor, portal.clientExternalId, {
        createdBy: portal.createdBy,
        requestorEmail: portal.requestorEmail,
      });
      const [
        appointments,
        externalGmudRef,
        portalDescription,
        grouping,
        watchers,
      ] = await Promise.all([
        this.appointments.listMergedAppointments(ticketNumber, actor),
        this.loadExternalGmudRef(ticketNumber),
        this.loadPortalTicketDescription(ticketNumber),
        this.loadTicketGrouping(ticketNumber),
        this.prisma.portalTicketWatcher.findMany({
          where: { ticketNumber },
          select: { email: true },
          orderBy: { createdAt: 'asc' },
        }),
      ]);
      let requestorName = portal.requestorName;
      let requestorEmail = portal.requestorEmail;
      let requestorTelephone = portal.requestorTelephone;
      if (!requestorName?.trim() && !requestorEmail?.trim()) {
        const tifluxRequestor =
          await this.loadTifluxRequestorMeta(ticketNumber);
        if (tifluxRequestor) {
          requestorName = tifluxRequestor.requestorName;
          requestorEmail = tifluxRequestor.requestorEmail;
          requestorTelephone = tifluxRequestor.requestorTelephone;
        }
      }
      const row: TicketRow & {
        requestor_name?: string | null;
        requestor_email?: string | null;
        requestor_telephone?: string | null;
      } = {
        ticket_number: portal.ticketNumber,
        title: portal.title,
        client_name: portal.clientName,
        client_external_id: portal.clientExternalId,
        created_by_way_of: portal.createdByWayOf,
        priority_name: portal.priorityName,
        status_name: portal.statusName,
        stage_name: portal.stageName,
        responsible_external_id: portal.responsibleExternalId,
        responsible_name: portal.responsibleName,
        desk_name: portal.deskName,
        desk_external_id: portal.deskExternalId,
        created_at_source: portal.createdAtSource,
        updated_at_source: portal.updatedAtSource,
        is_closed: portal.isClosed,
        requestor_name: requestorName,
        requestor_email: requestorEmail,
        requestor_telephone: requestorTelephone,
      };
      return {
        ticket: {
          ...this.mapListItem(row),
          deskName: row.desk_name,
          deskExternalId: row.desk_external_id ?? null,
          clientExternalId: row.client_external_id ?? null,
          isClosed: Boolean(row.is_closed),
          isPreTicket: portal.isPreTicket,
          requestorName: row.requestor_name ?? null,
          requestorEmail: row.requestor_email ?? null,
          requestorTelephone: row.requestor_telephone ?? null,
        },
        summary: this.buildDetailSummary(appointments),
        appointments,
        externalGmudRef,
        portalDescription,
        source: 'portal_tickets',
        grouping,
        canChangeClient: await this.actorCanChangeTicketClient(
          actor,
          row.responsible_external_id,
        ),
        classificationId: portal.classificationId ?? null,
        watchers: watchers.map((w) => ({ email: w.email })),
      };
    }

    const rows =
      (await this.prisma.$queryRaw<TicketRow[]>`
        SELECT
          t.ticket_number,
          t.title,
          t.client_name,
          t.client_external_id,
          t.created_by_way_of,
          t.priority_name,
          t.status_name,
          t.stage_name,
          t.responsible_external_id,
          t.responsible_name,
          t.desk_name,
          t.desk_external_id,
          t.created_at_source,
          t.updated_at_source,
          t.is_closed,
          t.requestor_name,
          t.requestor_email,
          t.requestor_telephone
        FROM tiflux.tickets t
        WHERE t.ticket_number = ${ticketNumber}
        LIMIT 1
      `) ?? [];

    const row = rows[0] as
      | (TicketRow & {
          requestor_name?: string | null;
          requestor_email?: string | null;
          requestor_telephone?: string | null;
        })
      | undefined;

    if (!row) {
      return this.getDetailFromTifluxApi(actor, ticketNumber);
    }

    await this.assertTicketClientScope(actor, row.client_external_id, {
      requestorEmail: row.requestor_email ?? null,
    });

    const [appointments, externalGmudRef, portalDescription, grouping] =
      await Promise.all([
        this.appointments.listMergedAppointments(ticketNumber, actor),
        this.loadExternalGmudRef(ticketNumber),
        this.loadPortalTicketDescription(ticketNumber),
        this.loadTicketGrouping(ticketNumber),
      ]);

    return {
      ticket: {
        ...this.mapListItem(row),
        deskName: row.desk_name,
        deskExternalId: row.desk_external_id ?? null,
        clientExternalId: row.client_external_id ?? null,
        isClosed: Boolean(row.is_closed),
        requestorName: row.requestor_name ?? null,
        requestorEmail: row.requestor_email ?? null,
        requestorTelephone: row.requestor_telephone ?? null,
      },
      summary: this.buildDetailSummary(appointments),
      appointments,
      externalGmudRef,
      portalDescription,
      grouping,
      canChangeClient: await this.actorCanChangeTicketClient(
        actor,
        row.responsible_external_id,
      ),
    };
  }

  async getTicketHistory(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
  ): Promise<TicketHistoryDto[]> {
    const ticket = await this.getTicketContext(ticketNumber);
    if (!ticket) {
      throw new NotFoundException('Ticket não encontrado.');
    }
    await this.assertTicketClientScope(actor, ticket.client_external_id, {
      createdBy: ticket.created_by,
      requestorEmail: ticket.requestor_email,
    });

    if (!isTifluxDisconnected()) {
      await this.syncTifluxTicketHistory(ticketNumber).catch((err) => {
        this.logger.warn(
          `Falha ao sincronizar histórico TiFlux do ticket ${ticketNumber}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      });
    }

    type HistoryEvent = TicketHistoryDto & { sortAt: Date };
    const events: HistoryEvent[] = [];

    let createdAtSource: Date | null = null;
    let updatedAtSource: Date | null = null;
    let stageNameMeta: string | null = null;

    if (isTicketsPortalCanonical() || isTifluxDisconnected()) {
      const portal = await this.prisma.portalTicket.findUnique({
        where: { ticketNumber },
        select: {
          createdAtSource: true,
          updatedAtSource: true,
          stageName: true,
        },
      });
      createdAtSource = portal?.createdAtSource
        ? new Date(portal.createdAtSource)
        : null;
      updatedAtSource = portal?.updatedAtSource
        ? new Date(portal.updatedAtSource)
        : null;
      stageNameMeta = portal?.stageName ?? null;
    } else {
      try {
        const metaRows =
          (await this.prisma.$queryRaw<
            Array<{
              created_at_source: Date | null;
              updated_at_source: Date | null;
              stage_name: string | null;
            }>
          >`
            SELECT t.created_at_source, t.updated_at_source, t.stage_name
            FROM tiflux.tickets t
            WHERE t.ticket_number = ${ticketNumber}
            LIMIT 1
          `) ?? [];
        const meta = metaRows[0];
        createdAtSource = meta?.created_at_source
          ? new Date(meta.created_at_source)
          : null;
        updatedAtSource = meta?.updated_at_source
          ? new Date(meta.updated_at_source)
          : null;
        stageNameMeta = meta?.stage_name ?? null;
      } catch {
        /* schema ausente */
      }
    }

    if (createdAtSource && !Number.isNaN(createdAtSource.getTime())) {
      events.push({
        id: `ticket-created-${ticketNumber}`,
        eventType: 'TICKET_CREATED',
        summary: isTifluxDisconnected()
          ? 'Ticket registrado no portal'
          : 'Ticket registrado',
        actorName: null,
        createdAt: createdAtSource.toISOString(),
        sortAt: createdAtSource,
      });
    }

    const cachedTiflux = await this.prisma.ticketHistory.findMany({
      where: { ticketNumber },
      orderBy: { occurredAt: 'desc' },
    });

    // Evita "Ticket atualizado" genérico quando já há evento específico
    // (reabrir/fechar/estágio) no mesmo instante.
    const LIFECYCLE_HISTORY_TYPES = new Set([
      'TICKET_CREATED',
      'PRE_TICKET_CREATED',
      'AUTOMATION_EXECUTED',
      'AUTOMATION_FAILED',
      'TICKET_REOPENED',
      'TICKET_CLOSED',
      'TICKET_CANCELLED',
      'STAGE_CHANGED',
      'RESPONSIBLE_CHANGED',
      'DESK_CHANGED',
      'TICKET_GROUPED',
      'COMMUNICATION_UPDATED',
      'COMMUNICATION_REMOVED',
      'APPOINTMENT_CREATED',
      'APPOINTMENT_UPDATED',
      'APPOINTMENT_DELETED',
    ]);
    const hasLifecycleNearUpdate =
      updatedAtSource != null &&
      !Number.isNaN(updatedAtSource.getTime()) &&
      cachedTiflux.some((row) => {
        if (!LIFECYCLE_HISTORY_TYPES.has(row.eventType)) return false;
        return (
          Math.abs(row.occurredAt.getTime() - updatedAtSource.getTime()) <=
          120_000
        );
      });

    if (
      updatedAtSource &&
      !Number.isNaN(updatedAtSource.getTime()) &&
      (!createdAtSource ||
        updatedAtSource.getTime() - createdAtSource.getTime() > 60_000) &&
      !hasLifecycleNearUpdate
    ) {
      events.push({
        id: `ticket-updated-${ticketNumber}-${updatedAtSource.getTime()}`,
        eventType: 'TICKET_UPDATED',
        summary: `Ticket atualizado${
          stageNameMeta ? ` · estágio: ${stageNameMeta}` : ''
        }`,
        actorName: null,
        createdAt: updatedAtSource.toISOString(),
        sortAt: updatedAtSource,
      });
    }

    for (const row of cachedTiflux) {
      events.push({
        id: `tiflux-cache-${row.id}`,
        eventType: row.eventType,
        summary: row.summary,
        actorName: row.actorName,
        createdAt: row.occurredAt.toISOString(),
        sortAt: row.occurredAt,
      });
    }

    // Tickets só-portal (pré-ticket/e-mail) sem linha em tiflux.tickets e sem evento de criação.
    const hasCreatedEvent = events.some(
      (e) => e.eventType === 'TICKET_CREATED',
    );
    if (!hasCreatedEvent) {
      const portalMeta = await this.prisma.portalTicket.findUnique({
        where: { ticketNumber },
        include: { creator: { select: { name: true } } },
      });
      if (portalMeta) {
        const when =
          portalMeta.createdAtSource ?? portalMeta.createdAt ?? new Date();
        const way = (portalMeta.createdByWayOf ?? '').trim().toLowerCase();
        let summary = 'Ticket criado no portal';
        if (way === 'e-mail' || way === 'email') {
          const from = [portalMeta.requestorName, portalMeta.requestorEmail]
            .filter(Boolean)
            .join(' · ');
          summary = from
            ? `Ticket gerado a partir de e-mail (${from})`
            : 'Ticket gerado a partir de e-mail';
        } else if (portalMeta.createdByWayOf?.trim()) {
          summary = `Ticket criado via ${portalMeta.createdByWayOf.trim()}`;
        }
        events.push({
          id: `portal-created-${ticketNumber}`,
          eventType: 'TICKET_CREATED',
          summary,
          actorName: portalMeta.creator?.name ?? null,
          createdAt: when.toISOString(),
          sortAt: when,
        });
      }
    }

    const portalAppointments =
      await this.prisma.portalTicketAppointment.findMany({
        where: { ticketNumber },
        include: { creator: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      });
    const claimedTifluxExternalIds = new Set<number>();
    const historyCreatedAppointmentIds = new Set<string>();
    for (const row of cachedTiflux) {
      if (row.eventType !== 'APPOINTMENT_CREATED') continue;
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      if (typeof payload.portalAppointmentId === 'string') {
        historyCreatedAppointmentIds.add(payload.portalAppointmentId);
      }
      const key = row.externalKey ?? '';
      if (key.startsWith('appointment_created:')) {
        historyCreatedAppointmentIds.add(
          key.slice('appointment_created:'.length),
        );
      }
    }
    for (const appt of portalAppointments) {
      if (appt.tifluxAppointmentExternalId != null) {
        claimedTifluxExternalIds.add(appt.tifluxAppointmentExternalId);
      }
      if (historyCreatedAppointmentIds.has(appt.id)) continue;
      const dateLabel = this.formatDateOnly(appt.appointmentDate) ?? '';
      events.push({
        id: `appt-${appt.id}`,
        eventType: 'APPOINTMENT_CREATED',
        summary: `Apontamento ${appt.initTime}–${appt.endTime}${dateLabel ? ` em ${dateLabel}` : ''}`,
        actorName: appt.creator.name,
        createdAt: appt.createdAt.toISOString(),
        sortAt: appt.createdAt,
      });
    }

    const tifluxApptRows =
      isTifluxDisconnected() || isTicketsPortalCanonical()
        ? []
        : ((await this.prisma.$queryRaw<AppointmentRow[]>`
        SELECT
          a.external_id,
          a.ticket_number,
          a.appointment_date,
          a.init_time,
          a.end_time,
          a.user_external_id,
          a.user_name,
          a.description,
          a.valorization_raw
        FROM tiflux.ticket_appointments a
        WHERE a.ticket_number = ${ticketNumber}
        ORDER BY a.appointment_date DESC, a.init_time DESC NULLS LAST
      `) ?? []);
    for (const row of tifluxApptRows) {
      const externalId = Number(row.external_id);
      if (claimedTifluxExternalIds.has(externalId)) continue;
      const dateLabel = this.formatDateOnly(row.appointment_date) ?? '';
      const init = this.formatTime(row.init_time);
      const end = this.formatTime(row.end_time);
      const sortAt = row.appointment_date
        ? new Date(row.appointment_date)
        : new Date();
      events.push({
        id: `tiflux-appt-${externalId}`,
        eventType: 'APPOINTMENT_TIFLUX',
        summary: `Apontamento ${init ?? '—'}–${end ?? '—'}${
          dateLabel ? ` em ${dateLabel}` : ''
        }`,
        actorName: row.user_name,
        createdAt: sortAt.toISOString(),
        sortAt,
      });
    }

    const gmud = await this.prisma.portalTicketGmudLink.findUnique({
      where: { ticketNumber },
      include: { creator: { select: { name: true } } },
    });
    if (gmud) {
      events.push({
        id: `gmud-${ticketNumber}`,
        eventType: 'GMUD_LINKED',
        summary: `GMUD vinculada: ${gmud.externalGmudRef}`,
        actorName: gmud.creator.name,
        createdAt: gmud.createdAt.toISOString(),
        sortAt: gmud.createdAt,
      });
      if (gmud.updatedAt.getTime() - gmud.createdAt.getTime() > 1000) {
        events.push({
          id: `gmud-updated-${ticketNumber}`,
          eventType: 'GMUD_UPDATED',
          summary: `GMUD atualizada: ${gmud.externalGmudRef}`,
          actorName: gmud.creator.name,
          createdAt: gmud.updatedAt.toISOString(),
          sortAt: gmud.updatedAt,
        });
      }
    }

    const project = await this.prisma.project.findFirst({
      where: { ticketNumber, deletedAt: null },
      select: { id: true, code: true, name: true, createdAt: true },
    });
    if (project) {
      events.push({
        id: `project-${project.id}`,
        eventType: 'PROJECT_LINKED',
        summary: `Projeto #${project.code} — ${project.name}`,
        actorName: null,
        createdAt: project.createdAt.toISOString(),
        sortAt: project.createdAt,
      });

      const projectHistory = await this.prisma.projectHistory.findMany({
        where: {
          projectId: project.id,
          eventType: 'APPOINTMENT_LINKED',
        },
        include: { actor: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      });
      for (const entry of projectHistory) {
        events.push({
          id: `project-hist-${entry.id}`,
          eventType: 'PROJECT_APPOINTMENT_LINKED',
          summary: entry.summary,
          actorName: entry.actor?.name ?? null,
          createdAt: entry.createdAt.toISOString(),
          sortAt: entry.createdAt,
        });
      }
    }

    const auditRows = await this.prisma.auditLog.findMany({
      where: { entity: 'Ticket', entityId: String(ticketNumber) },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    for (const log of auditRows) {
      // Já coberto por ticket_history (PORTAL) no mesmo instante.
      if (
        log.action === 'STAGE_CHANGED' &&
        cachedTiflux.some(
          (row) =>
            (row.eventType === 'STAGE_CHANGED' ||
              row.eventType === 'TICKET_CLOSED' ||
              row.eventType === 'TICKET_REOPENED' ||
              row.eventType === 'TICKET_CANCELLED') &&
            Math.abs(row.occurredAt.getTime() - log.createdAt.getTime()) <=
              120_000,
        )
      ) {
        continue;
      }

      const payload = (log.payload ?? {}) as Record<string, unknown>;
      let summary = String(payload.message ?? '').trim();
      if (log.action === 'STAGE_CHANGED') {
        const fromStage =
          typeof payload.fromStageName === 'string'
            ? payload.fromStageName
            : '—';
        const toStage =
          typeof payload.toStageName === 'string' ? payload.toStageName : '—';
        summary = `Estágio alterado: ${fromStage} → ${toStage}`;
      }
      events.push({
        id: `audit-${log.id}`,
        eventType: log.action,
        summary: summary || log.action,
        actorName: log.user?.name ?? null,
        createdAt: log.createdAt.toISOString(),
        sortAt: log.createdAt,
      });
    }

    return events
      .sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime())
      .map(({ sortAt: _sortAt, ...entry }) => entry);
  }

  private async syncTifluxTicketHistory(ticketNumber: number): Promise<void> {
    if (!this.allowRuntimeTifluxApi) {
      return;
    }

    const recent = await this.prisma.ticketHistory.findFirst({
      where: { ticketNumber, source: 'TIFLUX' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (recent && Date.now() - recent.createdAt.getTime() < 60 * 60 * 1000) {
      return;
    }

    const rows = await this.tiflux.getTicketHistories(ticketNumber);
    for (const raw of rows) {
      const mapped = this.mapTifluxHistoryRow(raw);
      if (!mapped) continue;

      const existing = mapped.externalKey
        ? await this.prisma.ticketHistory.findFirst({
            where: {
              ticketNumber,
              source: 'TIFLUX',
              externalKey: mapped.externalKey,
            },
            select: { id: true },
          })
        : null;

      const data = {
        ticketNumber,
        eventType: mapped.eventType,
        summary: mapped.summary,
        actorName: mapped.actorName,
        source: 'TIFLUX',
        externalKey: mapped.externalKey,
        payload: mapped.payload as object,
        occurredAt: mapped.occurredAt,
      };

      if (existing) {
        await this.prisma.ticketHistory.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await this.prisma.ticketHistory.create({ data });
      }
    }
  }

  private mapTifluxHistoryRow(raw: Record<string, unknown>): {
    eventType: string;
    summary: string;
    actorName: string | null;
    externalKey: string;
    payload: Record<string, unknown>;
    occurredAt: Date;
  } | null {
    const occurredRaw =
      raw.created_at ??
      raw.date ??
      raw.occurred_at ??
      raw.updated_at ??
      raw.timestamp;
    const occurredAt = occurredRaw ? new Date(String(occurredRaw)) : null;
    if (!occurredAt || Number.isNaN(occurredAt.getTime())) {
      return null;
    }

    const actorName = this.extractTifluxActorName(raw);
    const action = String(
      raw.action ?? raw.action_type ?? raw.type ?? raw.kind ?? '',
    ).toLowerCase();

    let eventType = 'TIFLUX_EVENT';
    if (
      action.includes('stage') ||
      action.includes('estagio') ||
      action.includes('estágio')
    ) {
      eventType = 'STAGE_CHANGED';
    } else if (
      action.includes('appointment') ||
      action.includes('apontamento')
    ) {
      eventType = 'APPOINTMENT_CREATED';
    }

    let summary = String(
      raw.description ?? raw.summary ?? raw.message ?? raw.title ?? '',
    ).trim();
    if (!summary) {
      const fromStage = raw.from_stage ?? raw.previous_stage;
      const toStage = raw.to_stage ?? raw.stage ?? raw.current_stage;
      if (fromStage != null || toStage != null) {
        const fromLabel =
          typeof fromStage === 'object' && fromStage && 'name' in fromStage
            ? String((fromStage as { name?: string }).name ?? '—')
            : String(fromStage ?? '—');
        const toLabel =
          typeof toStage === 'object' && toStage && 'name' in toStage
            ? String((toStage as { name?: string }).name ?? '—')
            : String(toStage ?? '—');
        summary = `Estágio alterado: ${fromLabel} → ${toLabel}`;
        eventType = 'STAGE_CHANGED';
      }
    }
    if (!summary) {
      summary =
        eventType === 'STAGE_CHANGED'
          ? 'Estágio alterado'
          : 'Evento registrado';
    }

    const externalKey =
      raw.id != null
        ? String(raw.id)
        : `${eventType}:${occurredAt.toISOString()}:${summary.slice(0, 120)}`;

    return {
      eventType,
      summary,
      actorName,
      externalKey,
      payload: raw,
      occurredAt,
    };
  }

  private extractTifluxActorName(raw: Record<string, unknown>): string | null {
    const candidates = [
      raw.user,
      raw.author,
      raw.responsible,
      raw.created_by,
      raw.updated_by,
      raw.actor,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
      if (candidate && typeof candidate === 'object' && 'name' in candidate) {
        const name = String((candidate as { name?: string }).name ?? '').trim();
        if (name) return name;
      }
    }
    return null;
  }

  private async getTicketContext(ticketNumber: number) {
    const portal = await this.prisma.portalTicket.findUnique({
      where: { ticketNumber },
    });
    if (portal) {
      return {
        ticket_number: portal.ticketNumber,
        client_external_id: portal.clientExternalId,
        client_name: portal.clientName,
        desk_external_id: portal.deskExternalId,
        desk_name: portal.deskName,
        stage_name: portal.stageName,
        is_closed: portal.isClosed,
        created_by: portal.createdBy,
        requestor_email: portal.requestorEmail,
      };
    }

    try {
      const rows =
        (await this.prisma.$queryRaw<
          Array<{
            ticket_number: number;
            client_external_id: number | null;
            client_name: string | null;
            desk_external_id: number | null;
            desk_name: string | null;
            stage_name: string | null;
            is_closed: boolean | null;
            requestor_email: string | null;
          }>
        >`
          SELECT
            t.ticket_number,
            t.client_external_id,
            t.client_name,
            t.desk_external_id,
            t.desk_name,
            t.stage_name,
            t.is_closed,
            t.requestor_email
          FROM tiflux.tickets t
          WHERE t.ticket_number = ${ticketNumber}
          LIMIT 1
        `) ?? [];
      const row = rows[0] ?? null;
      if (row) {
        return {
          ...row,
          created_by: null as string | null,
        };
      }
    } catch {
      // Schema tiflux.* pode estar ausente no cutover local.
    }

    if (!this.allowRuntimeTifluxApi) {
      return null;
    }

    const apiTicket = await this.tiflux.getTicket(ticketNumber);
    if (!apiTicket) {
      return null;
    }

    return {
      ticket_number: apiTicket.ticket_number,
      client_external_id: apiTicket.client?.id ?? null,
      client_name: apiTicket.client?.name ?? null,
      desk_external_id: apiTicket.desk?.id ?? null,
      desk_name: apiTicket.desk?.name ?? null,
      stage_name: apiTicket.stage?.name ?? null,
      is_closed: Boolean(apiTicket.is_closed),
      created_by: null as string | null,
      requestor_email:
        typeof apiTicket.requestor?.email === 'string'
          ? apiTicket.requestor.email
          : null,
    };
  }

  private async loadPortalTicketStageOptions(
    currentStageName: string | null,
  ): Promise<
    Array<{
      id: number;
      name: string;
      firstStage: boolean;
      lastStage: boolean;
    }>
  > {
    const rows = await this.prisma.ticketStage.findMany({
      where: { deletedAt: null, active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    let names =
      rows.length > 0
        ? rows.map((row) => row.name.trim()).filter(Boolean)
        : [...PORTAL_STAGES_ORDER];

    const current = currentStageName?.trim();
    if (
      current &&
      !names.some((n) => normalizeDeskName(n) === normalizeDeskName(current))
    ) {
      names = [current, ...names];
    }

    return names.map((name, index) => ({
      id: index + 1,
      name,
      firstStage: index === 0,
      lastStage: name === 'Encerrado' || name === 'Cancelado',
    }));
  }

  private resolveCurrentStageId(params: {
    stageName: string | null;
    stages: Array<{ id: number; name: string }>;
  }): number | null {
    const normalized = normalizeDeskName(params.stageName);
    if (!normalized) return null;

    const matched = params.stages.find(
      (stage) => normalizeDeskName(stage.name) === normalized,
    );
    return matched?.id ?? null;
  }

  private async patchLocalTicketStage(ticketNumber: number, stageName: string) {
    await this.prisma.$executeRawUnsafe(
      `
      UPDATE tiflux.tickets
      SET stage_name = $2::text
      WHERE ticket_number = $1
    `,
      ticketNumber,
      stageName,
    );
  }

  async listTicketStages(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
  ) {
    const ticket = await this.getTicketContext(ticketNumber);
    if (!ticket) {
      throw new NotFoundException('Ticket não encontrado.');
    }

    await this.assertTicketClientScope(actor, ticket.client_external_id, {
      createdBy: ticket.created_by,
      requestorEmail: ticket.requestor_email,
    });

    const deskExternalId = Number(ticket.desk_external_id);
    const deskOk =
      Number.isFinite(deskExternalId) && deskExternalId > 0
        ? deskExternalId
        : null;

    const stages = await this.loadPortalTicketStageOptions(ticket.stage_name);

    const currentStageId = this.resolveCurrentStageId({
      stageName: ticket.stage_name,
      stages,
    });

    return {
      deskExternalId: deskOk,
      deskName: ticket.desk_name,
      currentStageId,
      currentStageName: ticket.stage_name,
      isClosed: Boolean(ticket.is_closed),
      stages,
    };
  }

  async updateTicketStage(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    stageId: number,
    options?: { skipAutomations?: boolean },
  ) {
    const ticket = await this.getTicketContext(ticketNumber);
    if (!ticket) {
      throw new NotFoundException('Ticket não encontrado.');
    }

    if (ticket.is_closed) {
      throw new BadRequestException(
        'Não é possível alterar o estágio de um ticket fechado.',
      );
    }

    const stagesResponse = await this.listTicketStages(actor, ticketNumber);
    const stages = stagesResponse.stages;
    const targetStage = stages.find((stage) => stage.id === stageId);
    if (!targetStage) {
      throw new BadRequestException(
        'Estágio inválido para a mesa de serviço deste ticket.',
      );
    }

    if (stagesResponse.currentStageId === stageId) {
      if (targetStage.lastStage && !ticket.is_closed) {
        await this.portalStore.patchStage(ticketNumber, targetStage.name, {
          isClosed: true,
        });
        try {
          await this.prisma.ticketHistory.create({
            data: {
              ticketNumber,
              eventType: 'TICKET_CLOSED',
              summary: `Chamado fechado · estágio "${targetStage.name}"`,
              actorName: actor.email ?? null,
              source: 'PORTAL',
              externalKey: `close:${ticketNumber}:${Date.now()}`,
              payload: {
                fromStageName: ticket.stage_name,
                toStageName: targetStage.name,
                isClosed: true,
              },
              occurredAt: new Date(),
            },
          });
        } catch {
          /* ignore */
        }
        await this.dispatchStageAutomations(
          actor,
          ticketNumber,
          {
            fromStageName: ticket.stage_name,
            toStageName: targetStage.name,
            stageId: targetStage.id,
            deskExternalId: stagesResponse.deskExternalId ?? null,
          },
          options?.skipAutomations,
        );
        return {
          ok: true,
          stageId: targetStage.id,
          stageName: targetStage.name,
          stageGroup: resolveTicketStageGroup(targetStage.name),
          isClosed: true,
          message: `Ticket fechado (estágio "${targetStage.name}").`,
        };
      }
      return {
        ok: true,
        stageId: targetStage.id,
        stageName: targetStage.name,
        stageGroup: resolveTicketStageGroup(targetStage.name),
        isClosed: Boolean(targetStage.lastStage),
        message: 'O ticket já está neste estágio.',
      };
    }

    let stageName = targetStage.name;
    let resolvedStageId = stageId;
    const deskExternalId = Number(stagesResponse.deskExternalId);
    const portalOrigin = await this.prisma.portalTicket.findUnique({
      where: { ticketNumber },
      select: { origin: true, isPreTicket: true },
    });
    const skipTifluxWrite =
      !isTicketsTifluxWriteEnabled() ||
      Boolean(portalOrigin?.isPreTicket) ||
      portalOrigin?.origin === 'PORTAL';
    if (
      !skipTifluxWrite &&
      Number.isFinite(deskExternalId) &&
      deskExternalId > 0
    ) {
      try {
        const updated = await this.tiflux.updateTicket(ticketNumber, {
          stage_id: stageId,
        });
        stageName = updated.stage?.name ?? targetStage.name;
        resolvedStageId = updated.stage?.id ?? stageId;
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error
            ? error.message
            : 'Falha ao atualizar estágio.',
        );
      }
    }

    try {
      await this.patchLocalTicketStage(ticketNumber, stageName);
    } catch {
      // Mirror pode estar ausente.
    }
    await this.portalStore.patchStage(ticketNumber, stageName, {
      isClosed: Boolean(targetStage.lastStage),
    });

    try {
      const closing = Boolean(targetStage.lastStage) && !ticket.is_closed;
      await this.prisma.ticketHistory.create({
        data: {
          ticketNumber,
          eventType: closing ? 'TICKET_CLOSED' : 'STAGE_CHANGED',
          summary: closing
            ? `Chamado fechado · estágio "${stageName}"`
            : `Estágio atualizado de "${ticket.stage_name ?? '—'}" para "${stageName}"`,
          actorName: actor.email ?? null,
          source: 'PORTAL',
          externalKey: `stage:${ticketNumber}:${stageId}:${Date.now()}`,
          payload: {
            fromStageName: ticket.stage_name,
            toStageName: stageName,
            stageId,
            isClosed: Boolean(targetStage.lastStage),
          },
          occurredAt: new Date(),
        },
      });
    } catch {
      // Histórico não deve bloquear a mudança de estágio.
    }

    await this.audit.log({
      actor,
      action: 'STAGE_CHANGED',
      entity: 'Ticket',
      entityId: String(ticketNumber),
      payload: {
        fromStageName: ticket.stage_name,
        toStageName: stageName,
        stageId,
        isClosed: Boolean(targetStage.lastStage),
        tifluxWrite: !skipTifluxWrite,
      },
    });

    await this.dispatchStageAutomations(
      actor,
      ticketNumber,
      {
        fromStageName: ticket.stage_name,
        toStageName: stageName,
        stageId: resolvedStageId,
        deskExternalId:
          Number.isFinite(deskExternalId) && deskExternalId > 0
            ? deskExternalId
            : null,
      },
      options?.skipAutomations,
    );

    return {
      ok: true,
      stageId: resolvedStageId,
      stageName,
      stageGroup: resolveTicketStageGroup(stageName),
      isClosed: Boolean(targetStage.lastStage),
      message: targetStage.lastStage
        ? `Ticket fechado (estágio "${stageName}").`
        : `Estágio atualizado para "${stageName}".`,
    };
  }

  private async dispatchStageAutomations(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    partial: {
      fromStageName: string | null;
      toStageName: string;
      stageId: number;
      deskExternalId: number | null;
    },
    skipAutomations?: boolean,
  ) {
    if (skipAutomations) return;
    try {
      const portalRow = await this.prisma.portalTicket.findUnique({
        where: { ticketNumber },
        select: {
          deskExternalId: true,
          clientExternalId: true,
          classificationId: true,
        },
      });
      await this.ticketAutomation.handleStageChange(actor, {
        ticketNumber,
        fromStageName: partial.fromStageName,
        toStageName: partial.toStageName,
        stageName: partial.toStageName,
        stageId: partial.stageId,
        deskExternalId:
          portalRow?.deskExternalId ?? partial.deskExternalId ?? null,
        clientExternalId: portalRow?.clientExternalId ?? null,
        classificationId: portalRow?.classificationId ?? null,
      });
    } catch (error) {
      this.logger.warn(
        `Automações de estágio falharam no ticket #${ticketNumber}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async loadPortalTicketDescription(ticketNumber: number) {
    try {
      const row = await this.prisma.portalTicketDescription.findUnique({
        where: { ticketNumber },
      });

      let description = row?.description?.trim() ?? '';

      const pre = await this.prisma.preTicket.findFirst({
        where: { ticketNumber },
        include: {
          attachments: { include: { file: true } },
        },
      });

      if (!description) {
        const preHtml = pre?.descriptionHtml?.trim() ?? '';
        if (preHtml) {
          description = preHtml;
        }
      } else {
        const hasImage =
          /<img[\s\S]*src\s*=/i.test(description) ||
          description.includes('data:image/');
        if (!hasImage) {
          const html = pre?.descriptionHtml?.trim() ?? '';
          if (/<img[\s\S]*src\s*=/i.test(html) || html.includes('data:image/')) {
            description = html;
          }
        }
      }

      if (row) {
        const preFiles = (pre?.attachments ?? []).filter(
          (a) => a.file && !a.file.deletedAt,
        );
        if (preFiles.length > 0) {
          const already =
            await this.prisma.portalTicketAppointmentAttachment.findMany({
              where: {
                ticketNumber,
                fileId: { in: preFiles.map((a) => a.fileId) },
              },
              select: { fileId: true },
            });
          const linked = new Set(already.map((a) => a.fileId));
          for (const att of preFiles) {
            if (linked.has(att.fileId)) continue;
            await this.prisma.portalTicketAppointmentAttachment.create({
              data: {
                ticketNumber,
                portalAppointmentId: null,
                fileId: att.fileId,
                createdBy: row.createdBy,
              },
            });
          }
        }
      }

      const attachmentRows =
        await this.prisma.portalTicketAppointmentAttachment.findMany({
          where: {
            ticketNumber,
            portalAppointmentId: null,
          },
          include: { file: true },
          orderBy: { createdAt: 'asc' },
        });

      const previewMap = await this.appointments.loadAttachmentPreviewMap(
        attachmentRows.map((item) => item.id),
      );

      const portalAttachments = this.appointments.mapPortalAttachments(
        attachmentRows,
        previewMap,
      );

      if (description || portalAttachments.length > 0) {
        return {
          description,
          attachments: portalAttachments,
        };
      }

      return null;
    } catch {
      return null;
    }
  }
}
