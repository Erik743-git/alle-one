import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TenantScopeService } from '../../common/security/tenant-scope.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { AuditService } from '../audit/audit.service';
import { TifluxService } from '../tiflux/tiflux.service';
import type { TicketsListQueryDto } from './tickets.dto';
import {
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
  resolveClientListFilter,
} from './tickets-client-scope';
import {
  isTicketsPortalCanonical,
  isTicketsTifluxWriteEnabled,
} from './tickets-portal.config';
import { TicketsPortalStoreService } from './tickets-portal-store.service';

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
  responsibleName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  stageGroup: TicketStageGroupKey;
  externalGmudRef: string | null;
};

export type TicketHistoryDto = {
  id: string;
  eventType: string;
  summary: string;
  actorName: string | null;
  createdAt: string;
};

@Injectable()
export class TicketsQueryService {
  private readonly logger = new Logger(TicketsQueryService.name);
  private readonly allowRuntimeTifluxApi =
    process.env.TIFLUX_RUNTIME_API === 'true';

  constructor(
    private readonly prisma: PrismaService,
    private readonly tiflux: TifluxService,
    private readonly audit: AuditService,
    private readonly tenantScope: TenantScopeService,
    private readonly appointments: TicketsAppointmentsService,
    private readonly portalStore: TicketsPortalStoreService,
  ) {}

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

  private async resolveTifluxExternalIdForUser(
    email: string,
  ): Promise<{ externalId: number; name: string | null } | null> {
    const normalized = this.normalizeEmail(email);
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
      if (!row) return null;
      return {
        externalId: Number(row.external_id),
        name: row.name,
      };
    } catch {
      return null;
    }
  }

  private mapListItem(row: TicketRow): TicketListItemDto {
    return {
      ticketNumber: Number(row.ticket_number),
      title: row.title,
      clientName: row.client_name,
      origin: row.created_by_way_of,
      priorityName: row.priority_name,
      statusName: row.status_name,
      stageName: row.stage_name,
      responsibleName: row.responsible_name,
      createdAt: this.toIso(row.created_at_source),
      updatedAt: this.toIso(row.updated_at_source),
      stageGroup: resolveTicketStageGroup(row.stage_name),
      externalGmudRef: row.external_gmud_ref?.trim() || null,
    };
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
    const mineOnly = clientScope.mineOnlyForcedOff
      ? false
      : query.mineOnly !== false;
    const clientExternalIdFilter = clientScope.clientExternalId;

    let responsibleFilter: number | null = null;
    let responsibleName: string | null = null;
    let portalMineFallback: {
      createdBy: string;
      email: string;
    } | null = null;

    if (mineOnly) {
      const mine = await this.resolveTifluxExternalIdForUser(actor.email);
      if (mine) {
        responsibleFilter = mine.externalId;
        responsibleName = mine.name;
      } else {
        portalMineFallback = {
          createdBy: actor.userId,
          email: this.normalizeEmail(actor.email),
        };
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

    const rows = await this.prisma.portalTicket.findMany({
      where: {
        isClosed: false,
        ...(responsibleFilter != null
          ? { responsibleExternalId: responsibleFilter }
          : {}),
        ...(portalMineFallback
          ? {
              OR: [
                { createdBy: portalMineFallback.createdBy },
                {
                  requestorEmail: {
                    equals: portalMineFallback.email,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
        ...(clientExternalIdFilter != null
          ? { clientExternalId: clientExternalIdFilter }
          : {}),
        ...(query.stageName
          ? { stageName: { contains: query.stageName, mode: 'insensitive' } }
          : {}),
        ...(query.statusName
          ? { statusName: { contains: query.statusName, mode: 'insensitive' } }
          : {}),
        ...(query.deskName
          ? { deskName: { contains: query.deskName, mode: 'insensitive' } }
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
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                ...(Number.isFinite(Number(search))
                  ? [{ ticketNumber: Number(search) }]
                  : []),
              ],
            }
          : {}),
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
      message: portalMineFallback
        ? 'Filtrando pelos seus tickets no portal (sem vínculo TiFlux).'
        : null,
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

    await this.assertTicketClientScope(actor, apiTicket.client?.id ?? null);

    const [appointments, externalGmudRef, portalDescription] =
      await Promise.all([
        this.appointments.listMergedAppointments(ticketNumber),
        this.loadExternalGmudRef(ticketNumber),
        this.loadPortalTicketDescription(ticketNumber),
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

  /** CLIENT só acessa tickets do cliente TiFlux da própria empresa. */
  private async assertTicketClientScope(
    actor: AuthenticatedRequestUser,
    clientExternalId: number | null | undefined,
  ) {
    return assertTicketClientScope(this.tenantScope, actor, clientExternalId);
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
    const mineOnly = clientScope.mineOnlyForcedOff
      ? false
      : query.mineOnly !== false;
    const clientExternalIdFilter = clientScope.clientExternalId;

    let responsibleFilter: number | null = null;
    let responsibleName: string | null = null;

    if (mineOnly) {
      const mine = await this.resolveTifluxExternalIdForUser(actor.email);
      if (!mine) {
        return {
          total: 0,
          mineOnly: true,
          responsibleExternalId: null,
          responsibleName: null,
          tifluxUserResolved: false,
          message:
            'Seu e-mail não está vinculado a um usuário TiFlux. Use a busca avançada para consultar outros tickets.',
          groups: [],
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
    const search = query.search?.trim() ?? '';
    const ticketNumberFilter = query.ticketNumber ?? null;
    const externalGmudRefFilter = query.externalGmudRef?.trim() ?? '';

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
            WHERE COALESCE(t.is_closed, false) = false
              AND t.responsible_external_id = ${responsibleFilter}
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
            WHERE COALESCE(t.is_closed, false) = false
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
    const portal = await this.prisma.portalTicket.findUnique({
      where: { ticketNumber },
    });
    if (portal) {
      await this.assertTicketClientScope(actor, portal.clientExternalId);
      const [appointments, externalGmudRef, portalDescription] =
        await Promise.all([
          this.appointments.listMergedAppointments(ticketNumber),
          this.loadExternalGmudRef(ticketNumber),
          this.loadPortalTicketDescription(ticketNumber),
        ]);
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
        requestor_name: portal.requestorName,
        requestor_email: portal.requestorEmail,
        requestor_telephone: portal.requestorTelephone,
      };
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
        source: 'portal_tickets',
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

    await this.assertTicketClientScope(actor, row.client_external_id);

    const [appointments, externalGmudRef, portalDescription] =
      await Promise.all([
        this.appointments.listMergedAppointments(ticketNumber),
        this.loadExternalGmudRef(ticketNumber),
        this.loadPortalTicketDescription(ticketNumber),
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
    await this.assertTicketClientScope(actor, ticket.client_external_id);

    await this.syncTifluxTicketHistory(ticketNumber).catch((err) => {
      this.logger.warn(
        `Falha ao sincronizar histórico TiFlux do ticket ${ticketNumber}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    });

    type HistoryEvent = TicketHistoryDto & { sortAt: Date };
    const events: HistoryEvent[] = [];

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
    const createdAtSource = meta?.created_at_source
      ? new Date(meta.created_at_source)
      : null;
    if (createdAtSource && !Number.isNaN(createdAtSource.getTime())) {
      events.push({
        id: `ticket-created-${ticketNumber}`,
        eventType: 'TICKET_CREATED',
        summary: 'Ticket registrado no TiFlux',
        actorName: null,
        createdAt: createdAtSource.toISOString(),
        sortAt: createdAtSource,
      });
    }
    const updatedAtSource = meta?.updated_at_source
      ? new Date(meta.updated_at_source)
      : null;
    if (
      updatedAtSource &&
      !Number.isNaN(updatedAtSource.getTime()) &&
      (!createdAtSource ||
        updatedAtSource.getTime() - createdAtSource.getTime() > 60_000)
    ) {
      events.push({
        id: `ticket-updated-${ticketNumber}-${updatedAtSource.getTime()}`,
        eventType: 'TICKET_UPDATED',
        summary: `Ticket atualizado no TiFlux${
          meta?.stage_name ? ` · estágio: ${meta.stage_name}` : ''
        }`,
        actorName: null,
        createdAt: updatedAtSource.toISOString(),
        sortAt: updatedAtSource,
      });
    }

    const cachedTiflux = await this.prisma.ticketHistory.findMany({
      where: { ticketNumber },
      orderBy: { occurredAt: 'desc' },
    });
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
    const hasCreatedEvent = events.some((e) => e.eventType === 'TICKET_CREATED');
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
    for (const appt of portalAppointments) {
      if (appt.tifluxAppointmentExternalId != null) {
        claimedTifluxExternalIds.add(appt.tifluxAppointmentExternalId);
      }
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
      (await this.prisma.$queryRaw<AppointmentRow[]>`
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
      `) ?? [];
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
        summary: `Apontamento TiFlux ${init ?? '—'}–${end ?? '—'}${
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
      const payload = (log.payload ?? {}) as Record<string, unknown>;
      let summary = String(payload.message ?? '').trim();
      if (log.action === 'STAGE_CHANGED') {
        summary = `Estágio alterado: ${payload.fromStageName ?? '—'} → ${payload.toStageName ?? '—'}`;
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
          ? 'Estágio alterado no TiFlux'
          : 'Evento registrado no TiFlux';
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
          }>
        >`
          SELECT
            t.ticket_number,
            t.client_external_id,
            t.client_name,
            t.desk_external_id,
            t.desk_name,
            t.stage_name,
            t.is_closed
          FROM tiflux.tickets t
          WHERE t.ticket_number = ${ticketNumber}
          LIMIT 1
        `) ?? [];
      const row = rows[0] ?? null;
      if (row) {
        return row;
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
    };
  }

  private mapDeskStageOptions(raw: Array<Record<string, unknown>>): Array<{
    id: number;
    name: string;
    firstStage: boolean;
    lastStage: boolean;
  }> {
    return raw
      .map((row) => ({
        id: Number(row.id),
        name: String(row.name ?? '').trim(),
        firstStage: Boolean(row.first_stage),
        lastStage: Boolean(row.last_stage),
      }))
      .filter(
        (row) => Number.isFinite(row.id) && row.id > 0 && row.name.length > 0,
      )
      .sort((a, b) => a.id - b.id);
  }

  private async resolveCurrentStageId(params: {
    ticketNumber: number;
    deskExternalId: number;
    stageName: string | null;
    stages: Array<{ id: number; name: string }>;
  }): Promise<number | null> {
    if (this.allowRuntimeTifluxApi || isTicketsTifluxWriteEnabled()) {
      try {
        const apiTicket = await this.tiflux.getTicket(params.ticketNumber);
        const fromApi = Number(apiTicket?.stage?.id);
        if (Number.isFinite(fromApi) && fromApi > 0) {
          return fromApi;
        }
      } catch {
        // segue para match por nome
      }
    }

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

    await this.assertTicketClientScope(actor, ticket.client_external_id);

    const deskExternalId = Number(ticket.desk_external_id);
    const deskOk =
      Number.isFinite(deskExternalId) && deskExternalId > 0
        ? deskExternalId
        : null;

    let stages: Array<{
      id: number;
      name: string;
      firstStage: boolean;
      lastStage: boolean;
    }> = [];

    if (deskOk != null && isTicketsTifluxWriteEnabled()) {
      try {
        stages = this.mapDeskStageOptions(
          await this.tiflux.getDeskStages(deskOk),
        );
      } catch {
        stages = [];
      }
    }

    if (stages.length === 0) {
      const names = [
        'Aberto',
        'Em andamento',
        'Aguardando',
        'Resolvido',
        'Fechado',
      ];
      const current = ticket.stage_name?.trim();
      if (current && !names.some((n) => normalizeDeskName(n) === normalizeDeskName(current))) {
        names.unshift(current);
      }
      stages = names.map((name, index) => ({
        id: index + 1,
        name,
        firstStage: index === 0,
        lastStage: index === names.length - 1,
      }));
    }

    const currentStageId =
      deskOk != null
        ? await this.resolveCurrentStageId({
            ticketNumber,
            deskExternalId: deskOk,
            stageName: ticket.stage_name,
            stages,
          })
        : (stages.find(
            (s) =>
              normalizeDeskName(s.name) ===
              normalizeDeskName(ticket.stage_name),
          )?.id ?? null);

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
      return {
        ok: true,
        stageId: targetStage.id,
        stageName: targetStage.name,
        stageGroup: resolveTicketStageGroup(targetStage.name),
        message: 'O ticket já está neste estágio.',
      };
    }

    let stageName = targetStage.name;
    let resolvedStageId = stageId;
    const deskExternalId = Number(stagesResponse.deskExternalId);
    const portalOrigin = await this.prisma.portalTicket.findUnique({
      where: { ticketNumber },
      select: { origin: true },
    });
    const skipTifluxWrite =
      portalOrigin?.origin === 'PORTAL' || !isTicketsTifluxWriteEnabled();
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
            : 'Falha ao atualizar estágio no TiFlux.',
        );
      }
    }

    try {
      await this.patchLocalTicketStage(ticketNumber, stageName);
    } catch {
      // Mirror pode estar ausente.
    }
    await this.portalStore.patchStage(ticketNumber, stageName);

    await this.audit.log({
      actor,
      action: 'STAGE_CHANGED',
      entity: 'Ticket',
      entityId: String(ticketNumber),
      payload: {
        fromStageName: ticket.stage_name,
        toStageName: stageName,
        stageId,
        tifluxWrite: !skipTifluxWrite,
      },
    });

    return {
      ok: true,
      stageId: resolvedStageId,
      stageName,
      stageGroup: resolveTicketStageGroup(stageName),
      message: `Estágio atualizado para "${stageName}".`,
    };
  }

  private async loadPortalTicketDescription(ticketNumber: number) {
    try {
      const row = await this.prisma.portalTicketDescription.findUnique({
        where: { ticketNumber },
      });
      if (!row) return null;

      let description = row.description;

      const pre = await this.prisma.preTicket.findFirst({
        where: { ticketNumber },
        include: {
          attachments: { include: { file: true } },
        },
      });

      // Recupera HTML com imagem do pré-ticket quando a descrição foi salva só como texto.
      const hasImage =
        /<img[\s\S]*src\s*=/i.test(description) ||
        description.includes('data:image/');
      if (!hasImage) {
        const html = pre?.descriptionHtml?.trim() ?? '';
        if (/<img[\s\S]*src\s*=/i.test(html) || html.includes('data:image/')) {
          description = html;
        }
      }

      // Tickets abertos de e-mail antes do vínculo: garante anexos (ZIP etc.) no portal.
      const preFiles = (pre?.attachments ?? []).filter(
        (a) => a.file && !a.file.deletedAt,
      );
      if (preFiles.length > 0) {
        const already = await this.prisma.portalTicketAppointmentAttachment.findMany(
          {
            where: {
              ticketNumber,
              fileId: { in: preFiles.map((a) => a.fileId) },
            },
            select: { fileId: true },
          },
        );
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

      return {
        description,
        attachments: portalAttachments,
      };
    } catch {
      return null;
    }
  }
}
