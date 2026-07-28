import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { TifluxService } from '../tiflux/tiflux.service';
import { ZabbixService } from '../zabbix/zabbix.service';
import {
  categorizeTicketByDesk,
  emptyDeskCategoryCounts,
  type DeskCategory,
} from './desk-categories';
import {
  buildMonthMap,
  buildTifluxDateRange,
  buildWeekMap,
  getMonthKey,
  getMonthLabel,
  getCalendarMonthBoundsToDate,
  getRange,
  getWeekKey,
  getWeekLabel,
  getWeekStart,
  toDateOrNull,
  countDaysInRange,
  getDefaultDateRange,
} from './dashboard-date.utils';
import { DashboardChartsService } from './dashboard-charts.service';
import { DashboardIntegrationsService } from './dashboard-integrations.service';
import { DashboardHoursService } from './dashboard-hours.service';
import { isTicketsPortalCanonical } from '../tickets/tickets-portal.config';
import type {
  DashboardFilters,
  DashboardHoursResponse,
  DashboardMonthlyTrendMetric,
  DashboardMonthlyTrends,
  DashboardResponse,
  MonthlyAlertsRow,
  MonthlyTicketRow,
  TopHostsByMonthRow,
  TopTriggerRow,
  WeeklyAlertsRow,
  WorkHoursTifluxSummary,
} from './dashboard.types';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  /** Não registra nada em produção (evita vazamento de dados e ruído). */
  private devDebug(...args: unknown[]): void {
    if (process.env.NODE_ENV === 'production') return;
    const line = args
      .map((a) => {
        if (typeof a === 'string') return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(' | ');
    this.logger.debug(line);
  }

  /**
   * Segurança/performance: por padrão o portal NÃO consulta a API TiFlux em runtime.
   * Toda leitura deve vir do banco local sincronizado.
   * Para habilitar fallback temporário de API: TIFLUX_RUNTIME_API=true
   */
  private readonly allowRuntimeTifluxApi =
    process.env.TIFLUX_RUNTIME_API === 'true';
  /** Cache do /dashboard/complete em memória (ms). Env: DASHBOARD_COMPLETE_CACHE_MS */
  private readonly dashboardCacheTtlMs = (() => {
    const n = Number(process.env.DASHBOARD_COMPLETE_CACHE_MS);
    if (Number.isFinite(n) && n >= 5_000) {
      return Math.min(Math.trunc(n), 300_000);
    }
    return 60_000;
  })();
  private readonly responseCache = new Map<
    string,
    {
      expiresAt: number;
      data: DashboardResponse;
    }
  >();

  private readonly inFlightRequests = new Map<
    string,
    Promise<DashboardResponse>
  >();

  constructor(
    private readonly tifluxService: TifluxService,
    private readonly zabbixService: ZabbixService,
    private readonly prisma: PrismaService,
    private readonly dashboardCharts: DashboardChartsService,
    private readonly integrations: DashboardIntegrationsService,
    private readonly dashboardHours: DashboardHoursService,
  ) {}

  private buildCacheKey(params: DashboardFilters) {
    return JSON.stringify({
      group: params.group,
      start: params.start ?? '',
      end: params.end ?? '',
      companyId: params.companyId ?? '',
    });
  }

  /** Chave do cache do /dashboard/complete — inclui includeHours para não misturar payload com/sem horas. */
  private buildCompleteResponseCacheKey(
    scoped: DashboardFilters,
    includeHours: boolean,
  ) {
    return `${this.buildCacheKey(scoped)}|ih:${includeHours ? '1' : '0'}`;
  }

  private getCachedResponse(cacheKey: string) {
    const cached = this.responseCache.get(cacheKey);

    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      this.responseCache.delete(cacheKey);
      return null;
    }

    return cached.data;
  }

  private setCachedResponse(cacheKey: string, data: DashboardResponse) {
    this.responseCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + this.dashboardCacheTtlMs,
    });
  }

  private invalidateCache(params: DashboardFilters) {
    const base = this.buildCacheKey(params);

    this.responseCache.delete(`${base}|ih:0`);
    this.responseCache.delete(`${base}|ih:1`);
    this.inFlightRequests.delete(`${base}|ih:0`);
    this.inFlightRequests.delete(`${base}|ih:1`);
  }

  private mapDbTicketRowToChartShape(r: {
    ticket_number: number;
    title: string | null;
    created_at_source: Date | null;
    client_external_id: number | null;
    client_name: string | null;
    desk_external_id: number | null;
    desk_name: string | null;
  }): Record<string, unknown> {
    return {
      ticket_number: r.ticket_number,
      title: r.title ?? undefined,
      created_at: r.created_at_source
        ? r.created_at_source.toISOString().replace(/\.\d{3}Z$/, 'Z')
        : undefined,
      client:
        r.client_external_id != null || r.client_name
          ? {
              id: Number(r.client_external_id ?? 0),
              name: String(r.client_name ?? ''),
            }
          : null,
      desk:
        r.desk_external_id != null
          ? { id: r.desk_external_id, name: r.desk_name ?? '' }
          : r.desk_name
            ? { id: null, name: r.desk_name }
            : null,
    };
  }

  /**
   * Janela de tickets para o fluxo de horas na API: recuo em dias no início para alinhar ao
   * extrato TiFlux (apontamentos no período em tickets mais antigos). O filtro real dos
   * apontamentos continua em `filterAppointmentsByDashboardRange` / data do apontamento.
   */

  private buildEmptyTicketRows(
    startDate: Date,
    endDate: Date,
  ): MonthlyTicketRow[] {
    return Array.from(buildMonthMap(startDate, endDate).entries()).map(
      ([monthKey, monthLabel]) => ({
        monthKey,
        monthLabel,
        ...emptyDeskCategoryCounts(),
        Total: 0,
      }),
    );
  }

  private categorizeTicket(ticket: Record<string, unknown>): DeskCategory {
    return categorizeTicketByDesk(ticket);
  }

  private getDeskNameFromTicket(ticket: Record<string, unknown>): string {
    const desk =
      typeof ticket.desk === 'object' && ticket.desk && 'name' in ticket.desk
        ? String((ticket.desk as { name?: unknown }).name ?? '')
        : '';
    const normalized = desk.trim();
    return normalized || 'Sem mesa';
  }

  private buildDeskSummaryFromTickets(
    tickets: Array<Record<string, unknown>>,
  ): Array<{ deskName: string; totalTickets: number }> {
    const map = new Map<string, number>();
    for (const t of tickets) {
      const name = this.getDeskNameFromTicket(t);
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([deskName, totalTickets]) => ({ deskName, totalTickets }))
      .sort(
        (a, b) =>
          b.totalTickets - a.totalTickets ||
          a.deskName.localeCompare(b.deskName, 'pt-BR'),
      );
  }

  private buildTicketRows(
    tickets: Array<Record<string, unknown>>,
    startDate: Date,
    endDate: Date,
  ): MonthlyTicketRow[] {
    const rows = new Map<string, MonthlyTicketRow>();

    for (const row of this.buildEmptyTicketRows(startDate, endDate)) {
      rows.set(row.monthKey, row);
    }

    for (const ticket of tickets) {
      const createdAt = toDateOrNull(String(ticket.created_at ?? ''));

      if (!createdAt || createdAt < startDate || createdAt > endDate) {
        continue;
      }

      const monthKey = getMonthKey(createdAt);
      const row = rows.get(monthKey);

      if (!row) {
        continue;
      }

      const category = this.categorizeTicket(ticket);
      row[category] += 1;
      row.Total += 1;
    }

    return Array.from(rows.values());
  }

  /**
   * Resumo de tickets do dashboard a partir do espelho (tiflux ou portal canônico).
   * Alinhado ao filtro date_type=created_at + intervalo ISO usado no `buildTifluxDateRange`.
   */
  private async getDashboardTifluxSummaryFromDb(params: {
    tifluxClientId: number;
    startISO: string;
    endISO: string;
    chartLimit: number;
  }): Promise<{
    ticketsForCharts: Array<Record<string, unknown>>;
    /** Lista completa no período para tabela "Chamados por mês" / mesas (o cartão usa totalTickets). */
    ticketsForAggregation: Array<Record<string, unknown>>;
    totalTickets: number;
    totalOpenTickets: number;
  }> {
    const ticketsTable = isTicketsPortalCanonical()
      ? 'portal_tickets'
      : 'tiflux.tickets';

    const countRows =
      (await this.prisma.$queryRawUnsafe<
        Array<{ total_all: number; total_open: number }>
      >(
        `
        select
          count(*)::int as total_all,
          count(*) filter (
            where t.is_closed is null or t.is_closed = false
          )::int as total_open
        from ${ticketsTable} t
        where t.client_external_id = $1
          and t.created_at_source is not null
          and t.created_at_source >= $2::timestamptz
          and t.created_at_source <= $3::timestamptz
      `,
        params.tifluxClientId,
        params.startISO,
        params.endISO,
      )) ?? [];

    const totalTickets = countRows[0]?.total_all ?? 0;
    const totalOpenTickets = countRows[0]?.total_open ?? 0;

    const listRows =
      (await this.prisma.$queryRawUnsafe<
        Array<{
          ticket_number: number;
          title: string | null;
          created_at_source: Date | null;
          client_external_id: number | null;
          client_name: string | null;
          desk_external_id: number | null;
          desk_name: string | null;
        }>
      >(
        `
      select
        t.ticket_number,
        t.title,
        t.created_at_source,
        t.client_external_id,
        t.client_name,
        t.desk_external_id,
        t.desk_name
      from ${ticketsTable} t
      where t.client_external_id = $1
        and t.created_at_source is not null
        and t.created_at_source >= $2::timestamptz
        and t.created_at_source <= $3::timestamptz
      order by t.created_at_source desc
    `,
        params.tifluxClientId,
        params.startISO,
        params.endISO,
      )) ?? [];

    const ticketsForAggregation = listRows.map((r) =>
      this.mapDbTicketRowToChartShape(r),
    );
    const ticketsForCharts = ticketsForAggregation.slice(0, params.chartLimit);

    return {
      ticketsForCharts,
      ticketsForAggregation,
      totalTickets,
      totalOpenTickets,
    };
  }

  /** Evento de problema Zabbix (value=1); value=0 é recuperação e não entra em High/Disaster. */
  private isZabbixProblemEvent(event: Record<string, unknown>): boolean {
    return String(event.value ?? '') === '1';
  }

  private buildAlertsRows(
    events: Array<Record<string, unknown>>,
    startDate: Date,
    endDate: Date,
  ): MonthlyAlertsRow[] {
    const rows = new Map<string, MonthlyAlertsRow>();

    for (const [monthKey, monthLabel] of buildMonthMap(
      startDate,
      endDate,
    ).entries()) {
      rows.set(monthKey, {
        monthKey,
        monthLabel,
        High: 0,
        Disaster: 0,
        Total: 0,
      });
    }

    for (const event of events) {
      if (!this.isZabbixProblemEvent(event)) {
        continue;
      }

      const eventDate = toDateOrNull(
        new Date(Number(event.clock ?? 0) * 1000).toISOString(),
      );

      if (!eventDate || eventDate < startDate || eventDate > endDate) {
        continue;
      }

      const severity = Number(event.severity ?? 0);
      const monthKey = getMonthKey(eventDate);
      const row = rows.get(monthKey);

      if (!row) {
        continue;
      }

      if (severity === 4) {
        row.High += 1;
        row.Total += 1;
      }

      if (severity === 5) {
        row.Disaster += 1;
        row.Total += 1;
      }
    }

    return Array.from(rows.values());
  }

  private buildAlertsRowsByWeek(
    events: Array<Record<string, unknown>>,
    startDate: Date,
    endDate: Date,
  ): WeeklyAlertsRow[] {
    const rows = new Map<string, WeeklyAlertsRow>();

    for (const [weekKey, weekLabel] of buildWeekMap(
      startDate,
      endDate,
    ).entries()) {
      rows.set(weekKey, {
        weekKey,
        weekLabel,
        High: 0,
        Disaster: 0,
        Total: 0,
      });
    }

    for (const event of events) {
      if (!this.isZabbixProblemEvent(event)) {
        continue;
      }

      const eventDate = toDateOrNull(
        new Date(Number(event.clock ?? 0) * 1000).toISOString(),
      );

      if (!eventDate || eventDate < startDate || eventDate > endDate) {
        continue;
      }

      const severity = Number(event.severity ?? 0);
      const weekKey = getWeekKey(eventDate);
      const row = rows.get(weekKey);

      if (!row) {
        continue;
      }

      if (severity === 4) {
        row.High += 1;
        row.Total += 1;
      }

      if (severity === 5) {
        row.Disaster += 1;
        row.Total += 1;
      }
    }

    return Array.from(rows.values());
  }

  private buildTopHostsByMonth(
    events: Array<Record<string, unknown>>,
    startDate: Date,
    endDate: Date,
  ): TopHostsByMonthRow[] {
    const rows = new Map<
      string,
      {
        monthLabel: string;
        highMap: Map<string, number>;
        disasterMap: Map<string, number>;
      }
    >();

    for (const [monthKey, monthLabel] of buildMonthMap(
      startDate,
      endDate,
    ).entries()) {
      rows.set(monthKey, {
        monthLabel,
        highMap: new Map<string, number>(),
        disasterMap: new Map<string, number>(),
      });
    }

    for (const event of events) {
      if (!this.isZabbixProblemEvent(event)) {
        continue;
      }

      const eventDate = toDateOrNull(
        new Date(Number(event.clock ?? 0) * 1000).toISOString(),
      );

      if (!eventDate || eventDate < startDate || eventDate > endDate) {
        continue;
      }

      const severity = Number(event.severity ?? 0);
      const hostName =
        Array.isArray(event.hosts) && event.hosts.length > 0
          ? String((event.hosts[0] as { name?: string }).name ?? 'Host')
          : 'Host';

      const monthKey = getMonthKey(eventDate);
      const row = rows.get(monthKey);

      if (!row) {
        continue;
      }

      if (severity === 4) {
        row.highMap.set(hostName, (row.highMap.get(hostName) ?? 0) + 1);
      }

      if (severity === 5) {
        row.disasterMap.set(hostName, (row.disasterMap.get(hostName) ?? 0) + 1);
      }
    }

    return Array.from(rows.entries()).map(([monthKey, value]) => ({
      monthKey,
      monthLabel: value.monthLabel,
      High: Array.from(value.highMap.entries())
        .map(([host, quantity]) => ({ host, quantity }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 3),
      Disaster: Array.from(value.disasterMap.entries())
        .map(([host, quantity]) => ({ host, quantity }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 3),
    }));
  }

  private buildTopTriggers(
    events: Array<Record<string, unknown>>,
    startDate: Date,
    endDate: Date,
    limit = 20,
  ): {
    items: TopTriggerRow[];
    allItems: TopTriggerRow[];
    uniqueTriggers: number;
    totalProblemEvents: number;
  } {
    const triggerMap = new Map<string, TopTriggerRow>();

    for (const event of events) {
      if (!this.isZabbixProblemEvent(event)) {
        continue;
      }

      const eventDate = toDateOrNull(
        new Date(Number(event.clock ?? 0) * 1000).toISOString(),
      );

      if (!eventDate || eventDate < startDate || eventDate > endDate) {
        continue;
      }

      const severity = Number(event.severity ?? 0);

      if (![4, 5].includes(severity)) {
        continue;
      }

      const hostName =
        Array.isArray(event.hosts) && event.hosts.length > 0
          ? String((event.hosts[0] as { name?: string }).name ?? 'Host')
          : 'Host';

      const triggerName = String(event.name ?? 'Trigger');
      const severityLabel = severity === 5 ? 'Disaster' : 'High';
      const key = `${hostName}::${triggerName}::${severityLabel}`;

      const existing = triggerMap.get(key);

      if (existing) {
        existing.count += 1;
        continue;
      }

      triggerMap.set(key, {
        host: hostName,
        trigger: triggerName,
        severity: severityLabel,
        count: 1,
      });
    }

    const sorted = Array.from(triggerMap.values()).sort(
      (a, b) => b.count - a.count,
    );
    const totalProblemEvents = sorted.reduce((acc, row) => acc + row.count, 0);

    return {
      items: sorted.slice(0, limit),
      allItems: sorted,
      uniqueTriggers: sorted.length,
      totalProblemEvents,
    };
  }

  private async scopeDashboardFilters(
    user: AuthenticatedRequestUser,
    params: DashboardFilters,
  ): Promise<DashboardFilters> {
    if (user.role === 'CLIENT') {
      if (!user.companyId) {
        throw new ForbiddenException('Usuário sem empresa vinculada');
      }
      return { ...params, companyId: user.companyId };
    }
    return params;
  }

  /**
   * Horas do dashboard com cache + deduplicação de requisições (usado por /hours e pelo complete com horas).
   */

  async getCompleteDashboard(
    user: AuthenticatedRequestUser,
    params: DashboardFilters,
    options?: { includeHours?: boolean },
  ): Promise<DashboardResponse> {
    const scoped = await this.scopeDashboardFilters(user, params);
    const includeHours = options?.includeHours === true;
    const cacheKey = this.buildCompleteResponseCacheKey(scoped, includeHours);

    const cached = this.getCachedResponse(cacheKey);
    if (cached) {
      this.devDebug('getCompleteDashboard: retornando cache');
      return cached;
    }

    const existingInFlight = this.inFlightRequests.get(cacheKey);
    if (existingInFlight) {
      this.devDebug('getCompleteDashboard: retornando request em andamento');
      return existingInFlight;
    }

    const promise = this.buildCompleteDashboard(scoped, { includeHours });

    this.inFlightRequests.set(cacheKey, promise);

    try {
      const response = await promise;
      this.setCachedResponse(cacheKey, response);
      return response;
    } finally {
      this.inFlightRequests.delete(cacheKey);
    }
  }

  async refreshCompleteDashboard(
    user: AuthenticatedRequestUser,
    params: DashboardFilters,
  ): Promise<DashboardResponse> {
    const scoped = await this.scopeDashboardFilters(user, params);
    const { startDate, endDate } = getRange(scoped.start, scoped.end);
    const integrations = await this.integrations.resolveIntegrations(scoped);
    await this.zabbixService.invalidateDashboardCache(
      integrations.zabbixGroupName,
      { startDate, endDate },
    );
    this.invalidateCache(scoped);
    this.dashboardHours.invalidateCache(scoped);
    return this.getCompleteDashboard(user, params, { includeHours: true });
  }

  async getDashboardHours(
    user: AuthenticatedRequestUser,
    params: DashboardFilters,
  ): Promise<DashboardHoursResponse> {
    const scoped = await this.scopeDashboardFilters(user, params);
    return this.dashboardHours.getDashboardHours(scoped);
  }

  /**
   * Gera um dump (TXT/JSON) chamando APIs externas (TiFlux + Zabbix) no período informado,
   * para comparação manual com relatórios oficiais.
   *
   * IMPORTANTE: este método evita usar o cache local `tiflux.*` e external_api_cache.
   */
  async buildApiDebugDumpTxt(
    user: AuthenticatedRequestUser,
    params: DashboardFilters,
  ): Promise<string> {
    const scoped = await this.scopeDashboardFilters(user, params);
    const { startDate, endDate } = getRange(scoped.start, scoped.end);
    const days = countDaysInRange(startDate, endDate);
    const integrations = await this.integrations.resolveIntegrations(scoped);
    const { startISO, endISO } = buildTifluxDateRange(startDate, endDate);

    const makeTicketsPath = (filters: Record<string, unknown>) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) {
        if (v === undefined || v === null) continue;
        if (Array.isArray(v)) {
          if (v.length) sp.set(k, v.join(','));
          continue;
        }
        sp.set(k, String(v));
      }
      const q = sp.toString();
      return q ? `/tickets?${q}` : '/tickets';
    };

    const fetchTicketsAllPages = async (mode: 'created' | 'updated') => {
      const clientId = integrations.tifluxClientId;
      if (clientId === null) return { tickets: [] as any[], pages: 0 };
      const limit = 200;
      const maxPages = 50;
      const tickets: any[] = [];
      let page = 1;

      while (page <= maxPages) {
        const path =
          mode === 'created'
            ? makeTicketsPath({
                filter_by: 'all',
                client_ids: [clientId],
                date_type: 'created_at',
                start_datetime: startISO,
                end_datetime: endISO,
                limit,
                offset: page,
              })
            : makeTicketsPath({
                filter_by: 'all',
                client_ids: [clientId],
                update_start_datetime: startISO,
                update_end_datetime: endISO,
                limit,
                offset: page,
              });

        const pageData = await this.tifluxService.requestResource(path);
        const arr = Array.isArray(pageData) ? pageData : [];
        if (!arr.length) break;
        tickets.push(...arr);
        if (arr.length < limit) break;
        page += 1;
      }

      return { tickets, pages: page };
    };

    const fetchAppointmentsForTickets = async (
      ticketNumbers: number[],
    ): Promise<Record<string, unknown[]>> => {
      const startDateOnly = startISO.slice(0, 10);
      const endDateOnly = endISO.slice(0, 10);
      const out: Record<string, unknown[]> = {};

      // Limite defensivo para não gerar dump gigante por engano.
      const unique = Array.from(new Set(ticketNumbers)).slice(0, 1200);

      for (const n of unique) {
        // Paginação manual via requestResource (sem cache)
        const limit = 200;
        const maxPages = 50;
        const all: unknown[] = [];
        let offset = 1;

        while (offset <= maxPages) {
          const sp = new URLSearchParams();
          sp.set('offset', String(offset));
          sp.set('limit', String(limit));
          sp.set('start_date', startDateOnly);
          sp.set('end_date', endDateOnly);
          const path = `/tickets/${n}/appointments?${sp.toString()}`;

          const pageData = await this.tifluxService.requestResource(path);
          const arr = Array.isArray(pageData) ? pageData : [];
          if (!arr.length) break;
          all.push(...arr);
          if (arr.length < limit) break;
          offset += 1;
        }

        out[String(n)] = all;
      }

      return out;
    };

    const [zabbixPack, tifluxCreated, tifluxUpdated] = await Promise.all([
      (async () => {
        try {
          return await this.zabbixService.getDashboardDetailsByGroup(
            integrations.zabbixGroupName,
            { startDate, endDate },
          );
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
          } as any;
        }
      })(),
      fetchTicketsAllPages('created'),
      fetchTicketsAllPages('updated'),
    ]);

    const byNumber = new Map<number, any>();
    for (const t of tifluxCreated.tickets) {
      const n = Number(t?.ticket_number ?? 0);
      if (n) byNumber.set(n, t);
    }
    for (const t of tifluxUpdated.tickets) {
      const n = Number(t?.ticket_number ?? 0);
      if (n) byNumber.set(n, t);
    }

    const mergedTickets = Array.from(byNumber.values());
    const ticketNumbers = mergedTickets
      .map((t) => Number(t?.ticket_number ?? 0))
      .filter((n) => Number.isFinite(n) && n > 0);

    const appointmentsByTicket =
      await fetchAppointmentsForTickets(ticketNumbers);

    const computeAppointmentsSummary = (source: Record<string, unknown[]>) =>
      this.dashboardHours.buildAppointmentsDebugSummary(
        source,
        startDate,
        endDate,
      );

    const payload = {
      generatedAt: new Date().toISOString(),
      requestedBy: { userId: user.userId, role: user.role, email: user.email },
      filters: {
        group: scoped.group,
        companyId: scoped.companyId ?? null,
        start: scoped.start ?? null,
        end: scoped.end ?? null,
      },
      resolved: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        days,
        integrations,
        tifluxRange: { startISO, endISO },
      },
      tiflux: {
        createdTicketsPages: tifluxCreated.pages,
        updatedTicketsPages: tifluxUpdated.pages,
        createdTicketsCount: tifluxCreated.tickets.length,
        updatedTicketsCount: tifluxUpdated.tickets.length,
        mergedUniqueTicketsCount: mergedTickets.length,
        tickets: mergedTickets,
        appointmentsByTicket,
        appointmentsSummary: computeAppointmentsSummary(appointmentsByTicket),
      },
      zabbix: zabbixPack,
    };

    return JSON.stringify(payload, null, 2);
  }

  private async buildCompleteDashboard(
    params: DashboardFilters,
    options: { includeHours: boolean },
  ): Promise<DashboardResponse> {
    const { startDate, endDate } = getRange(params.start, params.end);
    const days = countDaysInRange(startDate, endDate);
    const integrations = await this.integrations.resolveIntegrations(params);
    const { startISO, endISO } = buildTifluxDateRange(startDate, endDate);
    const monthlyTrendsPromise = this.buildMonthlyTrends(
      params,
      integrations.zabbixGroupName,
    );

    this.devDebug('==================================================');
    this.devDebug('buildCompleteDashboard INÍCIO');
    this.devDebug('params:', params);
    this.devDebug('range startDate:', startDate.toISOString());
    this.devDebug('range endDate:', endDate.toISOString());
    this.devDebug('range startISO:', startISO);
    this.devDebug('range endISO:', endISO);
    this.devDebug('days:', days);
    this.devDebug('integrations:', integrations);
    this.devDebug('==================================================');

    let ticketsForCharts: Array<Record<string, unknown>> = [];
    let totalTickets = 0;
    let totalOpenTickets = 0;

    let zabbixData: {
      overview: {
        totalHosts: number;
        hostsAtivos: number;
        hostsInativos: number;
      };
      hosts: unknown[];
      templates: unknown[];
      events: Array<Record<string, unknown>>;
    } = {
      overview: {
        totalHosts: 0,
        hostsAtivos: 0,
        hostsInativos: 0,
      },
      hosts: [],
      templates: [],
      events: [],
    };

    const [zabbixPack, tifluxPack] = await Promise.all([
      (async () => {
        try {
          return await this.zabbixService.getDashboardDetailsByGroup(
            integrations.zabbixGroupName,
            { startDate, endDate },
          );
        } catch (error) {
          console.error('Erro ao buscar dados do Zabbix:', error);
          return null;
        }
      })(),
      (async () => {
        if (integrations.tifluxClientId === null) {
          this.devDebug('buildCompleteDashboard: tifluxClientId nulo');
          return {
            ticketsForCharts: [] as Array<Record<string, unknown>>,
            totalTickets: 0,
            totalOpenTickets: 0,
          };
        }
        const useDbCache = process.env.TIFLUX_USE_DB_CACHE !== 'false';

        if (useDbCache) {
          try {
            const fromDb = await this.getDashboardTifluxSummaryFromDb({
              tifluxClientId: integrations.tifluxClientId,
              startISO,
              endISO,
              chartLimit: this.dashboardCharts.chartTicketsLimit,
            });

            if (this.allowRuntimeTifluxApi) {
              // Sanity-check opcional para ambientes onde fallback da API está habilitado.
              try {
                const apiPage = await this.dashboardCharts.fetchTicketsPage({
                  tifluxClientId: integrations.tifluxClientId,
                  startISO,
                  endISO,
                  limit: 200,
                });

                const dbTotal = Number(fromDb.totalTickets ?? 0) || 0;

                // Se a API trouxer mais tickets que o banco, preferimos a API (dados mais completos).
                if (apiPage.totalItems > dbTotal) {
                  return {
                    ...fromDb,
                    totalTickets: apiPage.totalItems,
                    totalOpenTickets: apiPage.openCount,
                    ticketsForCharts: apiPage.tickets.slice(
                      0,
                      this.dashboardCharts.chartTicketsLimit,
                    ),
                    ticketsForAggregation:
                      apiPage.tickets.length &&
                      apiPage.tickets.length >=
                        Math.min(apiPage.totalItems, 200)
                        ? apiPage.tickets
                        : fromDb.ticketsForAggregation,
                  };
                }
              } catch (apiCheckError) {
                this.logger.warn(
                  `Sanity-check TiFlux API falhou; mantendo banco: ${apiCheckError instanceof Error ? apiCheckError.message : String(apiCheckError)}`,
                );
              }
            }

            this.devDebug('==================================================');
            this.devDebug('TIFLUX resumo (banco tiflux.tickets — sem API)');
            this.devDebug('totalTickets:', fromDb.totalTickets);
            this.devDebug('totalOpenTickets:', fromDb.totalOpenTickets);
            this.devDebug(
              'ticketsForCharts:',
              fromDb.ticketsForCharts.map((ticket) => ({
                ticket_number: ticket.ticket_number,
                title: ticket.title,
                created_at: ticket.created_at,
                client: ticket.client,
                desk: ticket.desk,
              })),
            );
            this.devDebug('==================================================');

            return fromDb;
          } catch (dbError) {
            console.error(
              'Erro ao ler tickets TiFlux do banco; tentando API:',
              dbError,
            );
          }
        }

        if (!this.allowRuntimeTifluxApi) {
          this.devDebug(
            'TIFLUX_RUNTIME_API desabilitado e leitura DB indisponível para este cliente.',
          );
          return {
            ticketsForCharts: [] as Array<Record<string, unknown>>,
            totalTickets: 0,
            totalOpenTickets: 0,
          };
        }

        try {
          const apiPage = await this.dashboardCharts.fetchTicketsPage({
            tifluxClientId: integrations.tifluxClientId,
            startISO,
            endISO,
          });

          this.devDebug('==================================================');
          this.devDebug('TIFLUX resumo rápido (API)');
          this.devDebug('totalTickets:', apiPage.totalItems);
          this.devDebug('totalOpenTickets:', apiPage.openCount);
          this.devDebug(
            'ticketsForCharts:',
            apiPage.tickets.map((ticket) => ({
              ticket_number: ticket.ticket_number,
              title: ticket.title,
              created_at: ticket.created_at,
              client: ticket.client,
              desk: ticket.desk,
            })),
          );
          this.devDebug('==================================================');

          return {
            ticketsForCharts: apiPage.tickets,
            totalTickets: apiPage.totalItems,
            totalOpenTickets: apiPage.openCount,
          };
        } catch (error) {
          this.logger.warn(
            `Erro ao buscar dados rápidos do TiFlux: ${error instanceof Error ? error.message : String(error)}`,
          );
          return {
            ticketsForCharts: [] as Array<Record<string, unknown>>,
            totalTickets: 0,
            totalOpenTickets: 0,
          };
        }
      })(),
    ]);

    if (zabbixPack) {
      zabbixData = {
        overview: zabbixPack.overview,
        hosts: zabbixPack.hosts,
        templates: zabbixPack.templates,
        events: zabbixPack.events,
      };
      this.devDebug('ZABBIX overview:', zabbixData.overview);
      this.devDebug('ZABBIX hosts count:', zabbixData.hosts.length);
      this.devDebug('ZABBIX templates count:', zabbixData.templates.length);
      this.devDebug('ZABBIX events count:', zabbixData.events.length);
    }

    ticketsForCharts = tifluxPack.ticketsForCharts;
    totalTickets = tifluxPack.totalTickets;
    totalOpenTickets = tifluxPack.totalOpenTickets;

    const packWithAgg = tifluxPack as {
      ticketsForAggregation?: Array<Record<string, unknown>>;
    };
    const rowsForChamados =
      packWithAgg.ticketsForAggregation &&
      packWithAgg.ticketsForAggregation.length > 0
        ? packWithAgg.ticketsForAggregation
        : ticketsForCharts;

    const ticketRows = this.buildTicketRows(
      rowsForChamados,
      startDate,
      endDate,
    );
    const alertRows = this.buildAlertsRows(
      zabbixData.events,
      startDate,
      endDate,
    );
    const alertRowsByWeek = this.buildAlertsRowsByWeek(
      zabbixData.events,
      startDate,
      endDate,
    );

    const topHostsByMonth = this.buildTopHostsByMonth(
      zabbixData.events,
      startDate,
      endDate,
    );

    const topTriggersPack = this.buildTopTriggers(
      zabbixData.events,
      startDate,
      endDate,
      20,
    );
    const topTriggers = topTriggersPack.items;

    const emptyHoursRows = this.dashboardHours.getEmptyHoursRows(
      startDate,
      endDate,
    );

    const totalChamados = ticketRows.reduce((acc, row) => acc + row.Total, 0);
    const totalHigh = alertRows.reduce((acc, row) => acc + row.High, 0);
    const totalDisaster = alertRows.reduce((acc, row) => acc + row.Disaster, 0);

    let hoursRows = emptyHoursRows;
    let totalHoras = 0;
    // Quando o complete é carregado sem horas (includeHours=false), retornamos placeholder
    // para o front não "piscar" 00:00 antes do /dashboard/hours completar.
    let totalHorasFormatadas = options.includeHours ? '00:00' : '--';
    let resumoHorasTrabalhadas: WorkHoursTifluxSummary | null = null;

    if (options.includeHours) {
      const hoursPack =
        await this.dashboardHours.loadOrReuseDashboardHours(params);
      hoursRows = hoursPack.horasPorMes ?? emptyHoursRows;
      totalHoras = hoursPack.summary.totalHoras ?? 0;
      totalHorasFormatadas = hoursPack.summary.totalHorasFormatadas ?? '00:00';
      resumoHorasTrabalhadas = hoursPack.resumoHorasTrabalhadas ?? null;
      // Não sobrescrever o total de tickets do período no dashboard.
    }

    this.devDebug('ticketRows:', ticketRows);
    this.devDebug('alertRows:', alertRows);
    this.devDebug('alertRowsByWeek:', alertRowsByWeek);
    this.devDebug('hoursRows usado no complete:', hoursRows);
    this.devDebug('summary final complete:', {
      totalChamados,
      totalTickets,
      totalOpenTickets,
      totalHoras,
      totalHorasFormatadas,
      totalHigh,
      totalDisaster,
      totalHosts: zabbixData.overview.totalHosts,
      hostsAtivos: zabbixData.overview.hostsAtivos,
      hostsInativos: zabbixData.overview.hostsInativos,
    });

    return {
      filters: {
        group: integrations.zabbixGroupName,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        companyId: params.companyId ?? null,
      },
      summary: {
        totalChamados,
        totalTickets,
        totalOpenTickets,
        totalHoras,
        totalHorasFormatadas,
        totalHigh,
        totalDisaster,
        totalTriggersDistintos: topTriggersPack.uniqueTriggers,
        totalHosts: zabbixData.overview.totalHosts,
        hostsAtivos: zabbixData.overview.hostsAtivos,
        hostsInativos: zabbixData.overview.hostsInativos,
      },
      chamadosPorMes: ticketRows,
      chamadosPorMesa: this.buildDeskSummaryFromTickets(rowsForChamados),
      horasPorMes: hoursRows,
      resumoHorasTrabalhadas,
      alertasPorMes: alertRows,
      alertasPorSemana: alertRowsByWeek,
      principaisHostsPorMes: topHostsByMonth,
      topTriggers,
      allTriggersInPeriod: topTriggersPack.allItems,
      hostsDetalhados: zabbixData.hosts,
      templates: zabbixData.templates,
      eventosRecentes: zabbixData.events.slice(0, 20),
      monthlyTrends: await monthlyTrendsPromise,
    };
  }

  private buildTrendMetric(
    currentValue: number,
    previousValue: number,
    currentMonthLabel: string,
    previousMonthLabel: string,
    currentValueFormatted?: string,
  ): DashboardMonthlyTrendMetric {
    const delta = Number((currentValue - previousValue).toFixed(2));
    let direction: DashboardMonthlyTrendMetric['direction'] = 'flat';

    if (delta > 0) {
      direction = 'up';
    } else if (delta < 0) {
      direction = 'down';
    }

    const deltaPercent =
      previousValue > 0
        ? Number(((delta / previousValue) * 100).toFixed(1))
        : currentValue > 0
          ? 100
          : 0;

    return {
      currentMonthLabel,
      previousMonthLabel,
      currentValue,
      previousValue,
      currentValueFormatted,
      delta,
      deltaPercent,
      direction,
    };
  }

  private countAlertsInRange(
    events: Array<Record<string, unknown>> | undefined,
    startDate: Date,
    endDate: Date,
  ): number {
    if (!events?.length) {
      return 0;
    }

    return this.buildAlertsRows(events, startDate, endDate).reduce(
      (acc, row) => acc + row.Total,
      0,
    );
  }

  private async buildMonthlyTrends(
    params: DashboardFilters,
    zabbixGroupName: string,
  ): Promise<DashboardMonthlyTrends> {
    const currentMonth = getCalendarMonthBoundsToDate(0);
    const previousMonth = getCalendarMonthBoundsToDate(-1);

    const [currentHours, previousHours, currentZabbix, previousZabbix] =
      await Promise.all([
        this.dashboardHours
          .loadOrReuseDashboardHours({
            ...params,
            start: currentMonth.start.toISOString(),
            end: currentMonth.end.toISOString(),
          })
          .catch(() => null),
        this.dashboardHours
          .loadOrReuseDashboardHours({
            ...params,
            start: previousMonth.start.toISOString(),
            end: previousMonth.end.toISOString(),
          })
          .catch(() => null),
        this.zabbixService
          .getDashboardDetailsByGroup(zabbixGroupName, {
            startDate: currentMonth.start,
            endDate: currentMonth.end,
          })
          .catch(() => null),
        this.zabbixService
          .getDashboardDetailsByGroup(zabbixGroupName, {
            startDate: previousMonth.start,
            endDate: previousMonth.end,
          })
          .catch(() => null),
      ]);

    const currentHoursValue = currentHours?.summary.totalHoras ?? 0;
    const previousHoursValue = previousHours?.summary.totalHoras ?? 0;
    const currentAlerts = this.countAlertsInRange(
      currentZabbix?.events,
      currentMonth.start,
      currentMonth.end,
    );
    const previousAlerts = this.countAlertsInRange(
      previousZabbix?.events,
      previousMonth.start,
      previousMonth.end,
    );

    return {
      horasTrabalhadas: this.buildTrendMetric(
        currentHoursValue,
        previousHoursValue,
        currentMonth.periodLabel,
        previousMonth.periodLabel,
        currentHours?.summary.totalHorasFormatadas,
      ),
      alertas: this.buildTrendMetric(
        currentAlerts,
        previousAlerts,
        currentMonth.periodLabel,
        previousMonth.periodLabel,
      ),
    };
  }
}
