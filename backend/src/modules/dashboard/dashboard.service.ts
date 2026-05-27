import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { TifluxService } from '../tiflux/tiflux.service';
import { ZabbixService } from '../zabbix/zabbix.service';
import {
  categorizeTicketByDesk,
  emptyDeskCategoryCounts,
  type DeskCategory,
  type MonthlyDeskBreakdownRow,
} from './desk-categories';

type MonthlyTicketRow = MonthlyDeskBreakdownRow;
type MonthlyHoursRow = MonthlyDeskBreakdownRow;

type MonthlyAlertsRow = {
  monthKey: string;
  monthLabel: string;
  High: number;
  Disaster: number;
  Total: number;
};

type WeeklyAlertsRow = {
  weekKey: string;
  weekLabel: string;
  High: number;
  Disaster: number;
  Total: number;
};

type TopHostsByMonthRow = {
  monthKey: string;
  monthLabel: string;
  High: Array<{ host: string; quantity: number }>;
  Disaster: Array<{ host: string; quantity: number }>;
};

type TopTriggerRow = {
  host: string;
  trigger: string;
  severity: 'High' | 'Disaster';
  count: number;
};

type AppointmentLike = {
  date?: string;
  init_time?: string;
  end_time?: string;
  description?: string;
  client?: { id: number; name: string } | null;
  user?: { id: number; name: string } | null;
  valorization?: unknown;
  [key: string]: unknown;
};

type DashboardFilters = {
  group: string;
  start?: string;
  end?: string;
  companyId?: string;
};

type DashboardSummary = {
  totalChamados: number;
  totalTickets: number;
  totalOpenTickets: number;
  totalHoras: number;
  totalHorasFormatadas?: string;
  totalHigh: number;
  totalDisaster: number;
  /** Combinações distintas host + trigger + severidade (High/Disaster) no período. */
  totalTriggersDistintos: number;
  totalHosts: number;
  hostsAtivos: number;
  hostsInativos: number;
};

type WorkHoursTifluxAssistanceBucket = 'externo' | 'remoto' | 'interno' | 'sem';

type WorkHoursTifluxLine = {
  data: string;
  horaInicio: string;
  horaFim: string;
  duracaoFormatada: string;
  assistencia: string;
  assistenciaBucket: WorkHoursTifluxAssistanceBucket;
  ticketNumber: number;
  titulo: string;
  atendente: string;
};

type WorkHoursTifluxSummary = {
  totalTicketsDistintos: number;
  totalMinutos: number;
  totalHorasFormatadas: string;
  semAssistenciaMinutos: number;
  semAssistenciaFormatado: string;
  externoMinutos: number;
  externoFormatado: string;
  remotoMinutos: number;
  remotoFormatado: string;
  internoMinutos: number;
  internoFormatado: string;
  /** Quantidade de apontamentos no período (após filtros do resumo). */
  totalApontamentosNoPeriodo: number;
  /** Limite de linhas enviadas na tabela (env TIFLUX_RESUMO_MAX_LINHAS). */
  limiteLinhas: number;
  linhas: WorkHoursTifluxLine[];
  linhasTruncadas: boolean;
};

type DashboardResponse = {
  filters: {
    group: string;
    start: string;
    end: string;
    companyId: string | null;
  };
  summary: DashboardSummary;
  chamadosPorMes: MonthlyTicketRow[];
  chamadosPorMesa: Array<{ deskName: string; totalTickets: number }>;
  horasPorMes: MonthlyHoursRow[];
  /** Resumo estilo relatório TiFlux (apontamentos no período, assistência, tickets distintos). */
  resumoHorasTrabalhadas: WorkHoursTifluxSummary | null;
  alertasPorMes: MonthlyAlertsRow[];
  /** Mesma lógica de alertasPorMes, bucket por semana (seg–dom) para gráficos. */
  alertasPorSemana: WeeklyAlertsRow[];
  principaisHostsPorMes: TopHostsByMonthRow[];
  topTriggers: TopTriggerRow[];
  /** Todas as combinações host+trigger+severidade no período (ordenadas por volume). */
  allTriggersInPeriod: TopTriggerRow[];
  hostsDetalhados: unknown[];
  templates: unknown[];
  eventosRecentes: unknown[];
};

type DashboardHoursResponse = {
  filters: {
    group: string;
    start: string;
    end: string;
    companyId: string | null;
  };
  summary: {
    totalHoras: number;
    totalHorasFormatadas: string;
    totalTicketsConsiderados: number;
  };
  horasPorMes: MonthlyHoursRow[];
  horasPorMesa: Array<{
    deskName: string;
    totalMinutes: number;
    totalHorasFormatadas: string;
  }>;
  resumoHorasTrabalhadas: WorkHoursTifluxSummary | null;
};

type ResolvedCompanyIntegration = {
  zabbixGroupName: string;
  tifluxClientId: number | null;
};

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

  private readonly tifluxAppointmentsBatchSize = 1;
  private readonly tifluxAppointmentsPauseMs = 800;
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
  private readonly hoursCacheTtlMs = 10 * 60 * 1000;
  // Horas apontadas: respeitamos estritamente o intervalo start/end do front.
  /** Se true, tickets sem apontamento no período não entram em horasPorMes nem em totalTicketsConsiderados. */
  private readonly hoursDropTicketsWithoutAppointmentsInPeriod = true;
  /**
   * Por padrão as horas do dashboard seguem a data do apontamento no intervalo (como o extrato de consumo no TiFlux).
   * Defina TIFLUX_DASHBOARD_HOURS_APPOINTMENT_DATE_ONLY=false para o modo estrito com review_date.
   */
  private readonly hoursAppointmentDateOnly =
    process.env.TIFLUX_DASHBOARD_HOURS_APPOINTMENT_DATE_ONLY !== 'false';
  /**
   * Quando true: dashboard de horas usa só o contrato “nu” da API TiFlux v2 —
   * uma listagem GET /tickets com date_type + start_datetime + end_datetime (sem união created/updated),
   * sem cache SQL local, sem pós-filtro de garantia/range/review_date nas horas (agregação por appointment.date).
   * Env: TIFLUX_DASHBOARD_RAW_API=true
   */
  private readonly tifluxDashboardRawApi =
    process.env.TIFLUX_DASHBOARD_RAW_API === 'true';
  // Mantemos apenas um guard de páginas para evitar loop infinito.
  private readonly hoursMaxPages = 100;
  /**
   * Ao montar horas pela API TiFlux (sem dados em `tiflux.ticket_appointments`), a listagem
   * de tickets usa created_at / updated_at. Tickets criados há mais tempo mas com apontamento
   * no período (como no extrato CSV) ficariam de fora. Recuamos N dias a partir do início do
   * filtro para incluir esses tickets; os apontamentos continuam filtrados pela data do
   * apontamento no intervalo do dashboard.
   * Env: TIFLUX_HOURS_TICKET_LOOKBACK_DAYS (0–3650; omissão = 730).
   */
  private readonly hoursTicketLookbackDays = (() => {
    const n = Number(process.env.TIFLUX_HOURS_TICKET_LOOKBACK_DAYS);
    if (Number.isFinite(n) && n >= 0) {
      return Math.min(Math.trunc(n), 3650);
    }
    return 730;
  })();
  /**
   * Se true, horas só usam SQL quando max(appointment_date) no cliente cobre o fim do filtro.
   * Com false (padrão), basta haver apontamentos no intervalo — evita listar milhares de tickets na API
   * quando o sync está 1–2 dias atrás (ex.: NG com filtro até fim do mês).
   */
  private readonly dbCacheRequireFullEndCoverage =
    process.env.TIFLUX_DB_CACHE_REQUIRE_FULL_COVERAGE === 'true';
  private readonly chartTicketsLimit = 200;
  private readonly tifluxAppointmentsPageSize = 200;
  private readonly tifluxAppointmentsMaxPages = 20;
  private loggedAppointmentSample = false;
  /**
   * Máximo de linhas na tabela do resumo TiFlux no dashboard.
   * Env: TIFLUX_RESUMO_MAX_LINHAS (1–100000). Por omissão 50000 para exibir praticamente tudo no período.
   */
  private readonly workSummaryMaxLinhas = (() => {
    const n = Number(process.env.TIFLUX_RESUMO_MAX_LINHAS);
    if (Number.isFinite(n) && n >= 1) {
      return Math.min(Math.trunc(n), 100_000);
    }
    return 50_000;
  })();

  private readonly responseCache = new Map<
    string,
    {
      expiresAt: number;
      data: DashboardResponse;
    }
  >();

  private readonly hoursCache = new Map<
    string,
    {
      expiresAt: number;
      data: DashboardHoursResponse;
    }
  >();

  private readonly inFlightRequests = new Map<
    string,
    Promise<DashboardResponse>
  >();
  private readonly inFlightHoursRequests = new Map<
    string,
    Promise<DashboardHoursResponse>
  >();

  constructor(
    private readonly tifluxService: TifluxService,
    private readonly zabbixService: ZabbixService,
    private readonly prisma: PrismaService,
  ) {}

  private buildCacheKey(params: DashboardFilters) {
    return JSON.stringify({
      group: params.group,
      start: params.start ?? '',
      end: params.end ?? '',
      companyId: params.companyId ?? '',
    });
  }

  private buildHoursCacheKey(params: DashboardFilters) {
    return `hours:${this.buildCacheKey(params)}|raw:${this.tifluxDashboardRawApi ? '1' : '0'}|rl:${this.workSummaryMaxLinhas}|lb:${this.hoursTicketLookbackDays}`;
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

  private getCachedHoursResponse(cacheKey: string) {
    const cached = this.hoursCache.get(cacheKey);

    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      this.hoursCache.delete(cacheKey);
      return null;
    }

    return cached.data;
  }

  private setCachedHoursResponse(
    cacheKey: string,
    data: DashboardHoursResponse,
  ) {
    this.hoursCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + this.hoursCacheTtlMs,
    });
  }

  private invalidateCache(params: DashboardFilters) {
    const base = this.buildCacheKey(params);
    const hoursCacheKey = this.buildHoursCacheKey(params);

    this.responseCache.delete(`${base}|ih:0`);
    this.responseCache.delete(`${base}|ih:1`);
    this.hoursCache.delete(hoursCacheKey);
    this.inFlightRequests.delete(`${base}|ih:0`);
    this.inFlightRequests.delete(`${base}|ih:1`);
    this.inFlightHoursRequests.delete(hoursCacheKey);
  }

  private toDateOrNull(value?: string): Date | null {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed;
  }

  private toDateFromUnknown(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date)
      return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'string') return this.toDateOrNull(value);
    if (typeof value === 'number') {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getDefaultDateRange() {
    const end = new Date();
    const start = new Date(end);

    start.setDate(end.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    return {
      start,
      end,
    };
  }

  private normalizeRange(startDate: Date, endDate: Date) {
    const normalizedStart = new Date(startDate);
    const normalizedEnd = new Date(endDate);

    // O front envia datas sem timezone (ex.: "2026-04-01T23:59:59").
    // Usar setUTCHours aqui pode "empurrar" o range em +1 dia dependendo do timezone local.
    // Para manter o intervalo consistente com o filtro visual do usuário, normalizamos em horário local.
    normalizedStart.setHours(0, 0, 0, 0);
    normalizedEnd.setHours(23, 59, 59, 999);

    if (normalizedEnd.getTime() <= normalizedStart.getTime()) {
      normalizedEnd.setTime(normalizedStart.getTime() + 1000);
    }

    return {
      startDate: normalizedStart,
      endDate: normalizedEnd,
    };
  }

  private buildTifluxDateRange(startDate: Date, endDate: Date) {
    const normalized = this.normalizeRange(startDate, endDate);

    return {
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      startISO: normalized.startDate.toISOString(),
      endISO: normalized.endDate.toISOString(),
    };
  }

  private getDashboardHoursDateOptions(): {
    preferReviewDate: boolean;
    requireReviewDateIfAny: boolean;
  } {
    if (this.hoursAppointmentDateOnly) {
      return { preferReviewDate: false, requireReviewDateIfAny: false };
    }
    return { preferReviewDate: true, requireReviewDateIfAny: true };
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
  private buildTicketFetchWindowForHours(
    userStartDate: Date,
    userEndDate: Date,
  ): { ticketStart: Date; ticketEnd: Date } {
    const { startDate, endDate } = this.normalizeRange(
      userStartDate,
      userEndDate,
    );
    const ticketStart = new Date(startDate);
    ticketStart.setDate(ticketStart.getDate() - this.hoursTicketLookbackDays);
    ticketStart.setHours(0, 0, 0, 0);
    return { ticketStart, ticketEnd: endDate };
  }

  private toDateOnlyISO(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private getAppointmentReviewDate(appointment: AppointmentLike): Date | null {
    const a = appointment as Record<string, unknown>;
    // TiFlux report usa date_type=review_date; esses campos variam por tenant/versão.
    const candidates: unknown[] = [
      a.review_date,
      a.reviewed_at,
      a.reviewedAt,
      a.revised_at,
      a.revisedAt,
      (a.valorization as any)?.review_date,
      (a.valorization as any)?.reviewed_at,
      (a.valorization as any)?.reviewedAt,
    ];

    for (const c of candidates) {
      const d = this.toDateFromUnknown(c);
      if (d) return d;
    }

    return null;
  }

  private getAppointmentEffectiveDate(
    appointment: AppointmentLike,
    options: { preferReviewDate: boolean },
  ): {
    date: Date | null;
    source: 'review_date' | 'appointment.date' | 'none';
  } {
    if (options.preferReviewDate) {
      const review = this.getAppointmentReviewDate(appointment);
      if (review) return { date: review, source: 'review_date' };
    }

    const byDateField = this.toDateOrNull(appointment.date);
    if (byDateField) return { date: byDateField, source: 'appointment.date' };

    return { date: null, source: 'none' };
  }

  private isAppointmentDateInRange(
    appointment: AppointmentLike,
    startDate: Date,
    endDate: Date,
    options: {
      preferReviewDate: boolean;
      requireReviewDateIfAny: boolean;
      hasAnyReviewDate: boolean;
    },
  ): boolean {
    const effective = this.getAppointmentEffectiveDate(appointment, {
      preferReviewDate: options.preferReviewDate,
    });

    if (options.requireReviewDateIfAny && options.hasAnyReviewDate) {
      if (effective.source !== 'review_date') {
        return false;
      }
    }

    return Boolean(
      effective.date &&
      effective.date >= startDate &&
      effective.date <= endDate,
    );
  }

  private filterAppointmentsByDashboardRange(
    appointments: AppointmentLike[],
    startDate: Date,
    endDate: Date,
    options: { preferReviewDate: boolean; requireReviewDateIfAny: boolean },
  ): AppointmentLike[] {
    const hasAnyReviewDate = appointments.some((a) =>
      this.getAppointmentReviewDate(a),
    );
    return appointments.filter((a) =>
      this.isAppointmentDateInRange(a, startDate, endDate, {
        preferReviewDate: options.preferReviewDate,
        requireReviewDateIfAny: options.requireReviewDateIfAny,
        hasAnyReviewDate,
      }),
    );
  }

  private filterAppointmentsToBillableTypes(appointments: AppointmentLike[]) {
    const isBillable = (a: AppointmentLike) => {
      // No relatório "Extrato de consumo", a coluna "Contrato / Serviço"
      // geralmente vem de appointment.valorization.loose_service.name (ou equivalente).
      const v = a.valorization as any;
      const serviceName = String(
        v?.loose_service?.name ?? v?.contract?.name ?? '',
      ).toUpperCase();
      if (serviceName) {
        return serviceName === 'HORA NORMAL' || serviceName === 'HORA EXTRA';
      }

      // Fallback: alguns tenants podem não trazer valorization populado.
      const d = String(a.description ?? '').toUpperCase();
      return d.includes('HORA NORMAL') || d.includes('HORA EXTRA');
    };

    // Usado apenas para lógica de "tickets considerados" (PDF costuma contar tickets com HORA NORMAL/HORA EXTRA).
    return appointments.filter(isBillable);
  }

  private filterAppointmentsExcludeGuarantee(appointments: AppointmentLike[]) {
    // No extrato (PDF), itens marcados como garantia normalmente não entram na soma.
    // Campos podem variar por tenant/versão, então tratamos de forma defensiva.
    const isGuaranteed = (a: AppointmentLike) => {
      const v = a.valorization as any;
      const raw = v?.guarantee ?? v?.is_guarantee ?? v?.isGuarantee;
      return raw === true || raw === 'true' || raw === 1 || raw === '1';
    };
    return appointments.filter((a) => !isGuaranteed(a));
  }

  private getAppointmentServiceLabel(appointment: AppointmentLike) {
    const v = appointment.valorization as any;
    const service = String(
      v?.loose_service?.name ?? v?.contract?.name ?? '',
    ).trim();
    const shift = String(v?.shift?.name ?? '').trim();
    const raw = service || shift || '';
    if (raw) return raw;
    const desc = String(appointment.description ?? '').trim();
    return desc || 'SEM_CLASSIFICACAO';
  }

  private getRange(start?: string, end?: string) {
    const fallback = this.getDefaultDateRange();

    const startParsed = this.toDateOrNull(start);
    const endParsed = this.toDateOrNull(end);

    // Se o front enviou start/end e a data for inválida, não pode cair em fallback silencioso
    // porque isso gera números totalmente diferentes do filtro visual.
    if (start && !startParsed) {
      throw new BadRequestException('Data inicial inválida');
    }
    if (end && !endParsed) {
      throw new BadRequestException('Data final inválida');
    }

    const rawStartDate = startParsed ?? fallback.start;
    const rawEndDate = endParsed ?? fallback.end;

    return this.normalizeRange(rawStartDate, rawEndDate);
  }

  private getMonthKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    return `${year}-${month}`;
  }

  private getMonthLabel(date: Date) {
    return date.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });
  }

  /** Segunda-feira da semana do dia (horário local). */
  private getWeekStart(date: Date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const daysFromMonday = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - daysFromMonday);
    return d;
  }

  private getWeekKey(date: Date) {
    const start = this.getWeekStart(date);
    const year = start.getFullYear();
    const month = String(start.getMonth() + 1).padStart(2, '0');
    const day = String(start.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getWeekLabel(weekStart: Date) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const dayFmt = (d: Date) =>
      d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

    const startStr = dayFmt(weekStart);
    const endStr =
      weekEnd.getMonth() === weekStart.getMonth() &&
      weekEnd.getFullYear() === weekStart.getFullYear()
        ? weekEnd.toLocaleDateString('pt-BR', { day: '2-digit' })
        : dayFmt(weekEnd);

    return `${startStr} – ${endStr}`;
  }

  private buildWeekMap(startDate: Date, endDate: Date) {
    const result = new Map<string, string>();
    const cursor = this.getWeekStart(startDate);
    const limit = this.getWeekStart(endDate);

    while (cursor <= limit) {
      result.set(this.getWeekKey(cursor), this.getWeekLabel(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }

    return result;
  }

  private buildMonthMap(startDate: Date, endDate: Date) {
    const result = new Map<string, string>();
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const limit = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    while (cursor <= limit) {
      result.set(this.getMonthKey(cursor), this.getMonthLabel(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return result;
  }

  private buildEmptyTicketRows(
    startDate: Date,
    endDate: Date,
  ): MonthlyTicketRow[] {
    return Array.from(this.buildMonthMap(startDate, endDate).entries()).map(
      ([monthKey, monthLabel]) => ({
        monthKey,
        monthLabel,
        ...emptyDeskCategoryCounts(),
        Total: 0,
      }),
    );
  }

  private buildEmptyHoursRows(
    startDate: Date,
    endDate: Date,
  ): MonthlyHoursRow[] {
    return Array.from(this.buildMonthMap(startDate, endDate).entries()).map(
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

  private buildDeskSummaryFromAppointments(
    appointmentsByTicket: Array<{
      ticket: Record<string, unknown>;
      appointments: AppointmentLike[];
    }>,
  ): Array<{
    deskName: string;
    totalMinutes: number;
    totalHorasFormatadas: string;
  }> {
    const map = new Map<string, number>();
    for (const item of appointmentsByTicket) {
      const deskName = this.getDeskNameFromTicket(item.ticket);
      for (const appt of item.appointments) {
        const minutes = this.getAppointmentMinutes(appt);
        map.set(deskName, (map.get(deskName) ?? 0) + minutes);
      }
    }
    return Array.from(map.entries())
      .map(([deskName, totalMinutes]) => ({
        deskName,
        totalMinutes,
        totalHorasFormatadas: this.formatMinutesToHHMM(totalMinutes),
      }))
      .sort(
        (a, b) =>
          b.totalMinutes - a.totalMinutes ||
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
      const createdAt = this.toDateOrNull(String(ticket.created_at ?? ''));

      if (!createdAt || createdAt < startDate || createdAt > endDate) {
        continue;
      }

      const monthKey = this.getMonthKey(createdAt);
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

  private getAppointmentMinutes(appointment: AppointmentLike): number {
    const a = appointment as Record<string, unknown>;
    const vRaw = a.valorization;
    let v: Record<string, unknown> | undefined;
    if (vRaw && typeof vRaw === 'object' && !Array.isArray(vRaw)) {
      v = vRaw as Record<string, unknown>;
    }
    if (typeof vRaw === 'string' && vRaw.trim()) {
      try {
        const parsed = JSON.parse(vRaw) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          v = parsed as Record<string, unknown>;
        }
      } catch {
        /* ignora */
      }
    }

    const initRaw = String(a.init_time ?? '').trim();
    const endRaw = String(a.end_time ?? '').trim();

    const parseTime = (value: string) => {
      const base = value.split('.')[0]?.trim() ?? '';
      const parts = base.split(':').map((item) => Number(item.trim()));
      const [h, m, s] = [parts[0], parts[1], parts[2] ?? 0];
      return { h, m, s };
    };

    const clockDiffMinutes = (): number | null => {
      if (!initRaw || !endRaw) {
        return null;
      }
      if (initRaw.includes('T') || endRaw.includes('T')) {
        return null;
      }
      const start = parseTime(initRaw);
      const end = parseTime(endRaw);
      if (
        [start.h, start.m, start.s, end.h, end.m, end.s].some((value) =>
          Number.isNaN(value),
        )
      ) {
        return null;
      }
      const startTotalSeconds = start.h * 3600 + start.m * 60 + start.s;
      const endTotalSeconds = end.h * 3600 + end.m * 60 + end.s;
      let diffSeconds = endTotalSeconds - startTotalSeconds;
      if (diffSeconds < 0) {
        diffSeconds += 24 * 3600;
      }
      if (diffSeconds <= 0) {
        return null;
      }
      return Math.floor(diffSeconds / 60);
    };

    const isoDiffMinutes = (): number | null => {
      if (!initRaw || !endRaw) {
        return null;
      }
      if (!initRaw.includes('T') || !endRaw.includes('T')) {
        return null;
      }
      const d1 = new Date(initRaw);
      const d2 = new Date(endRaw);
      if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) {
        return null;
      }
      const ms = d2.getTime() - d1.getTime();
      if (ms <= 0) {
        return null;
      }
      return Math.floor(ms / 60000);
    };

    const clockMin = clockDiffMinutes();
    const isoMin = isoDiffMinutes();
    const refMin =
      isoMin != null && isoMin > 0
        ? isoMin
        : clockMin != null && clockMin > 0
          ? clockMin
          : null;

    const normalizeDurationNumber = (raw: number): number | null => {
      if (!Number.isFinite(raw) || raw <= 0) {
        return null;
      }
      if (!Number.isInteger(raw) && raw < 72) {
        return Math.max(1, Math.round(raw * 60));
      }
      const n = Math.trunc(raw);
      if (refMin != null) {
        const asMinutes = n;
        const asSecondsToMin = Math.floor(n / 60);
        const errM = Math.abs(asMinutes - refMin);
        const errS = Math.abs(asSecondsToMin - refMin);
        if (errM <= 2 && errM <= errS) {
          return asMinutes;
        }
        if (errS <= 2 && errS < errM) {
          return asSecondsToMin;
        }
        if (errM <= errS) {
          return asMinutes;
        }
        return asSecondsToMin;
      }
      if (n <= 720) {
        return n;
      }
      if (n < 86_400 && n % 60 === 0) {
        return Math.floor(n / 60);
      }
      return n;
    };

    const durTop = a.duration;
    if (durTop != null && durTop !== '') {
      const d = Number(durTop);
      const m = normalizeDurationNumber(d);
      if (m != null && m > 0) {
        return m;
      }
    }

    const minutesOnly = (val: unknown, max = 50_000): number | null => {
      if (val == null) {
        return null;
      }
      const n = Number(val);
      if (!Number.isFinite(n) || n <= 0) {
        return null;
      }
      if (!Number.isInteger(n)) {
        return Math.max(1, Math.round(n));
      }
      if (n > max) {
        return null;
      }
      return Math.trunc(n);
    };

    const explicitMinuteKeys = [
      'duration_minutes',
      'total_minutes',
      'minutes',
      'worked_minutes',
      'time_in_minutes',
      'duration_in_minutes',
    ];
    for (const key of explicitMinuteKeys) {
      const m = minutesOnly(a[key]);
      if (m != null) {
        return m;
      }
      if (v) {
        const m2 = minutesOnly(v[key]);
        if (m2 != null) {
          return m2;
        }
      }
    }

    if (v) {
      const nested = v.duration as Record<string, unknown> | undefined;
      if (nested && typeof nested === 'object') {
        const m3 = minutesOnly(nested.minutes ?? nested.total ?? nested.value);
        if (m3 != null) {
          return m3;
        }
      }
      const vd = v.duration;
      if (typeof vd === 'number') {
        const m4 = normalizeDurationNumber(vd);
        if (m4 != null && m4 > 0) {
          return m4;
        }
      }
    }

    if (isoMin != null && isoMin > 0) {
      return isoMin;
    }

    if (clockMin != null && clockMin > 0) {
      return clockMin;
    }

    return 0;
  }

  private formatMinutesToHHMM(totalMinutes: number) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  /** Duração estilo relatório TiFlux (ex.: 4:00:00). */
  private formatDuracaoRelatorioMinutos(totalMinutes: number): string {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}:${String(m).padStart(2, '0')}:00`;
  }

  private formatDatePtBrFromAppointmentDate(
    dateStr: string | undefined,
  ): string {
    const d = this.toDateOrNull(String(dateStr ?? ''));
    if (!d) {
      return '';
    }
    return d.toLocaleDateString('pt-BR');
  }

  private isAppointmentCalendarDateInRange(
    appointment: AppointmentLike,
    startDate: Date,
    endDate: Date,
  ): boolean {
    const d = this.toDateOrNull(String(appointment.date ?? ''));
    if (!d) {
      return false;
    }
    return d >= startDate && d <= endDate;
  }

  private getAppointmentAttendantName(appointment: AppointmentLike): string {
    const u = appointment.user as { name?: string } | undefined;
    if (u?.name?.trim()) {
      return u.name.trim();
    }
    const a = appointment as Record<string, unknown>;
    const v = a.valorization as Record<string, unknown> | undefined;
    if (v && typeof v === 'object') {
      const user = v.user as { name?: unknown } | undefined;
      const tech = v.technician as { name?: unknown } | undefined;
      const att = v.attendant as { name?: unknown } | undefined;
      for (const c of [user?.name, tech?.name, att?.name]) {
        if (c != null && String(c).trim()) {
          return String(c).trim();
        }
      }
    }
    return '—';
  }

  private stringifyValorizationForHaystack(valorization: unknown): string {
    if (valorization == null) {
      return '';
    }
    try {
      return JSON.stringify(valorization).toLowerCase();
    } catch {
      return '';
    }
  }

  private classifyAppointmentAssistance(appointment: AppointmentLike): {
    bucket: WorkHoursTifluxAssistanceBucket;
    label: string;
  } {
    const a = appointment as Record<string, unknown>;
    const parts: string[] = [];
    const push = (v: unknown) => {
      if (v == null) return;
      const s = String(v).trim();
      if (s) parts.push(s);
    };

    push(a.assistance);
    push(a.assistance_type);
    push(a.attendance);
    push(a.appointment_attendance);
    push(a.attendance_type);
    const apWayRoot = a.appointment_way as { name?: unknown } | undefined;
    push(apWayRoot?.name);
    const v = a.valorization as Record<string, unknown> | undefined;
    if (v && typeof v === 'object') {
      push(v.assistance);
      push(v.assistance_type);
      const way = v.way as { name?: unknown } | undefined;
      const shift = v.shift as { name?: unknown } | undefined;
      push(way?.name);
      push(shift?.name);
      const apWay = v.appointment_way as { name?: unknown } | undefined;
      push(apWay?.name);
    }

    const joined = parts.join(' ').toLowerCase();
    const desc = String(appointment.description ?? '').toLowerCase();
    const jsonHay = this.stringifyValorizationForHaystack(a.valorization);
    const hay = `${joined} ${desc} ${jsonHay}`;

    if (
      hay.includes('externo') ||
      hay.includes('presencial') ||
      hay.includes('on-site') ||
      hay.includes('onsite')
    ) {
      return { bucket: 'externo', label: 'Externo' };
    }
    if (
      hay.includes('remoto') ||
      hay.includes('remote') ||
      hay.includes('online')
    ) {
      return { bucket: 'remoto', label: 'Remoto' };
    }
    if (hay.includes('interno') || hay.includes('internal')) {
      return { bucket: 'interno', label: 'Interno' };
    }

    if (parts[0]) {
      return { bucket: 'sem', label: parts[0] };
    }
    return { bucket: 'sem', label: '—' };
  }

  private buildWorkHoursTifluxSummary(
    appointmentsByTicket: Array<{
      ticket: Record<string, unknown>;
      appointments: AppointmentLike[];
    }>,
    startDate: Date,
    endDate: Date,
  ): WorkHoursTifluxSummary {
    const maxLinhas = this.workSummaryMaxLinhas;

    type AccRow = {
      ticketNumber: number;
      titulo: string;
      dataSort: number;
      dataLabel: string;
      init: string;
      end: string;
      minutes: number;
      bucket: WorkHoursTifluxAssistanceBucket;
      assistenciaLabel: string;
      atendente: string;
    };

    const acc: AccRow[] = [];

    for (const item of appointmentsByTicket) {
      const ticketNumber = Number(item.ticket.ticket_number ?? 0);
      if (!Number.isFinite(ticketNumber) || ticketNumber <= 0) {
        continue;
      }
      const titulo = String(item.ticket.title ?? '');

      for (const appt of item.appointments) {
        if (!this.isAppointmentCalendarDateInRange(appt, startDate, endDate)) {
          continue;
        }
        if (!this.filterAppointmentsExcludeGuarantee([appt]).length) {
          continue;
        }
        const minutes = this.getAppointmentMinutes(appt);
        if (minutes <= 0) {
          continue;
        }
        const { bucket, label } = this.classifyAppointmentAssistance(appt);
        const dateRaw = String(appt.date ?? '');
        const d = this.toDateOrNull(dateRaw);
        const dataLabel = this.formatDatePtBrFromAppointmentDate(dateRaw);
        const init = String(appt.init_time ?? '').trim();
        const end = String(appt.end_time ?? '').trim();

        acc.push({
          ticketNumber,
          titulo,
          dataSort: d ? d.getTime() : 0,
          dataLabel,
          init,
          end,
          minutes,
          bucket,
          assistenciaLabel: label,
          atendente: this.getAppointmentAttendantName(appt),
        });
      }
    }

    acc.sort((x, y) => {
      if (x.dataSort !== y.dataSort) {
        return x.dataSort - y.dataSort;
      }
      return x.init.localeCompare(y.init, 'pt-BR');
    });

    const ticketsComMinutos = new Set<number>();
    let externoMinutos = 0;
    let remotoMinutos = 0;
    let internoMinutos = 0;
    let semAssistenciaMinutos = 0;
    let totalMinutos = 0;

    for (const r of acc) {
      totalMinutos += r.minutes;
      ticketsComMinutos.add(r.ticketNumber);
      if (r.bucket === 'externo') {
        externoMinutos += r.minutes;
      } else if (r.bucket === 'remoto') {
        remotoMinutos += r.minutes;
      } else if (r.bucket === 'interno') {
        internoMinutos += r.minutes;
      } else {
        semAssistenciaMinutos += r.minutes;
      }
    }

    const linhasTruncadas = acc.length > maxLinhas;
    const linhasSlice = acc.slice(0, maxLinhas);

    const linhas: WorkHoursTifluxLine[] = linhasSlice.map((r) => ({
      data: r.dataLabel,
      horaInicio: r.init,
      horaFim: r.end,
      duracaoFormatada: this.formatDuracaoRelatorioMinutos(r.minutes),
      assistencia: r.assistenciaLabel,
      assistenciaBucket: r.bucket,
      ticketNumber: r.ticketNumber,
      titulo: r.titulo,
      atendente: r.atendente,
    }));

    return {
      totalTicketsDistintos: ticketsComMinutos.size,
      totalMinutos,
      totalHorasFormatadas: this.formatMinutesToHHMM(totalMinutos),
      semAssistenciaMinutos,
      semAssistenciaFormatado: this.formatMinutesToHHMM(semAssistenciaMinutos),
      externoMinutos,
      externoFormatado: this.formatMinutesToHHMM(externoMinutos),
      remotoMinutos,
      remotoFormatado: this.formatMinutesToHHMM(remotoMinutos),
      internoMinutos,
      internoFormatado: this.formatMinutesToHHMM(internoMinutos),
      totalApontamentosNoPeriodo: acc.length,
      limiteLinhas: maxLinhas,
      linhas,
      linhasTruncadas,
    };
  }

  private async resolveIntegrations(
    params: DashboardFilters,
  ): Promise<ResolvedCompanyIntegration> {
    let zabbixGroupName = params.group;
    let tifluxClientId: number | null = null;

    // Prioridade:
    // 1) companyId (quando o front escolhe uma empresa específica)
    // 2) zabbixGroupName (quando o front filtra pelo grupo, mas não troca companyId)
    if (params.companyId) {
      const company = await this.prisma.company.findFirst({
        where: {
          id: params.companyId,
          deletedAt: null,
        },
      });

      if (company?.zabbixGroupName?.trim()) {
        zabbixGroupName = company.zabbixGroupName;
      }

      if (
        company?.tifluxClientId !== null &&
        company?.tifluxClientId !== undefined
      ) {
        tifluxClientId = company.tifluxClientId;
      }
    } else if (params.group?.trim()) {
      const companyByGroup = await this.prisma.company.findFirst({
        where: {
          deletedAt: null,
          zabbixGroupName: params.group.trim(),
        },
      });

      if (
        companyByGroup?.tifluxClientId !== null &&
        companyByGroup?.tifluxClientId !== undefined
      ) {
        tifluxClientId = companyByGroup.tifluxClientId;
      }

      // Mantém o grupo informado; se existir um nome canônico salvo, usa.
      if (companyByGroup?.zabbixGroupName?.trim()) {
        zabbixGroupName = companyByGroup.zabbixGroupName;
      }
    }

    return {
      zabbixGroupName,
      tifluxClientId,
    };
  }

  private async getTicketsForCharts(filters: {
    startDate: Date;
    endDate: Date;
    tifluxClientId: number | null;
  }): Promise<Array<Record<string, unknown>>> {
    if (filters.tifluxClientId === null) {
      this.devDebug('getTicketsForCharts: tifluxClientId nulo, retornando []');
      return [];
    }

    const { startISO, endISO } = this.buildTifluxDateRange(
      filters.startDate,
      filters.endDate,
    );

    this.devDebug('==================================================');
    this.devDebug('getTicketsForCharts');
    this.devDebug('clientId:', filters.tifluxClientId);
    this.devDebug('startISO:', startISO);
    this.devDebug('endISO:', endISO);
    this.devDebug('limit:', this.chartTicketsLimit);
    this.devDebug('==================================================');

    if (!this.allowRuntimeTifluxApi) {
      return [];
    }

    try {
      const tickets = await this.tifluxService.getTickets({
        filter_by: 'all',
        client_ids: [filters.tifluxClientId],
        date_type: 'created_at',
        start_datetime: startISO,
        end_datetime: endISO,
        limit: this.chartTicketsLimit,
        offset: 1,
      });

      this.devDebug(
        'getTicketsForCharts retorno:',
        (tickets as Array<Record<string, unknown>>).map((ticket) => ({
          ticket_number: ticket.ticket_number,
          title: ticket.title,
          created_at: ticket.created_at,
          client: ticket.client,
          desk: ticket.desk,
        })),
      );

      return tickets as Array<Record<string, unknown>>;
    } catch (error) {
      console.error('Erro ao buscar tickets para gráficos:', error);
      return [];
    }
  }

  private async getTicketsForHours(filters: {
    appointmentRangeStart: Date;
    appointmentRangeEnd: Date;
    tifluxClientId: number | null;
  }): Promise<Array<{ ticket_number: number } & Record<string, unknown>>> {
    if (filters.tifluxClientId === null) {
      this.devDebug('getTicketsForHours: tifluxClientId nulo, retornando []');
      return [];
    }
    if (!this.allowRuntimeTifluxApi) {
      this.devDebug(
        'getTicketsForHours: TIFLUX_RUNTIME_API desabilitado, retornando []',
      );
      return [];
    }

    const clientId = filters.tifluxClientId;

    const { ticketStart, ticketEnd } = this.buildTicketFetchWindowForHours(
      filters.appointmentRangeStart,
      filters.appointmentRangeEnd,
    );
    const { startISO, endISO } = this.buildTifluxDateRange(
      ticketStart,
      ticketEnd,
    );

    const pageSize = 200;

    if (this.tifluxDashboardRawApi) {
      this.devDebug('==================================================');
      this.devDebug(
        'getTicketsForHours (RAW: GET /tickets único — filter_by=all, client_ids, date_type=created_at, start_datetime, end_datetime, limit, offset; sem update_* nem segunda listagem)',
      );
      this.devDebug('clientId:', clientId);
      this.devDebug('range tickets (API listagem):', { startISO, endISO });
      this.devDebug(
        'lookback dias (só listagem de tickets):',
        this.hoursTicketLookbackDays,
      );
      this.devDebug('hoursMaxPages:', this.hoursMaxPages);
      this.devDebug('==================================================');

      const all: Array<{ ticket_number: number } & Record<string, unknown>> =
        [];
      let page = 1;
      while (page <= this.hoursMaxPages) {
        const pageTickets = await this.tifluxService.getTickets({
          filter_by: 'all',
          client_ids: [clientId],
          date_type: 'created_at',
          start_datetime: startISO,
          end_datetime: endISO,
          limit: pageSize,
          offset: page,
        });
        const normalized = pageTickets as Array<
          { ticket_number: number } & Record<string, unknown>
        >;
        if (!normalized.length) {
          break;
        }
        all.push(...normalized);
        if (normalized.length < pageSize) {
          break;
        }
        page += 1;
      }
      this.devDebug('getTicketsForHours RAW total:', all.length);
      return all;
    }

    const fetchPaged = async (mode: 'created' | 'updated') => {
      let page = 1;
      const all: Array<{ ticket_number: number } & Record<string, unknown>> =
        [];

      while (page <= this.hoursMaxPages) {
        const pageTickets =
          mode === 'created'
            ? await this.tifluxService.getTickets({
                filter_by: 'all',
                client_ids: [clientId],
                date_type: 'created_at',
                start_datetime: startISO,
                end_datetime: endISO,
                limit: pageSize,
                offset: page,
              })
            : await this.tifluxService.getTickets({
                filter_by: 'all',
                client_ids: [clientId],
                update_start_datetime: startISO,
                update_end_datetime: endISO,
                limit: pageSize,
                offset: page,
              });

        const normalized = pageTickets as Array<
          { ticket_number: number } & Record<string, unknown>
        >;

        if (!normalized.length) {
          break;
        }

        all.push(...normalized);

        if (normalized.length < pageSize) {
          break;
        }

        page += 1;
      }

      return all;
    };

    this.devDebug('==================================================');
    this.devDebug(
      'getTicketsForHours (UNIÃO: tickets criados + atualizados na janela alargada; apontamentos filtrados pelo período do dashboard)',
    );
    this.devDebug('clientId:', filters.tifluxClientId);
    this.devDebug('range tickets (API listagem):', { startISO, endISO });
    this.devDebug(
      'lookback dias (só listagem de tickets):',
      this.hoursTicketLookbackDays,
    );
    this.devDebug('filtro apontamentos (front):', {
      start: filters.appointmentRangeStart.toISOString(),
      end: filters.appointmentRangeEnd.toISOString(),
    });
    this.devDebug('hoursMaxPages:', this.hoursMaxPages);
    this.devDebug('==================================================');

    const [createdTickets, updatedTickets] = await Promise.all([
      fetchPaged('created'),
      fetchPaged('updated'),
    ]);

    const byNumber = new Map<
      number,
      { ticket_number: number } & Record<string, unknown>
    >();
    for (const t of createdTickets) {
      byNumber.set(t.ticket_number, t);
    }
    for (const t of updatedTickets) {
      byNumber.set(t.ticket_number, t);
    }

    const allTickets = Array.from(byNumber.values());

    this.devDebug('getTicketsForHours totals:', {
      created: createdTickets.length,
      updated: updatedTickets.length,
      unique: allTickets.length,
    });

    return allTickets;
  }

  private async getAllAppointmentsForTicket(
    ticketNumber: number,
    filters: { startDate: Date; endDate: Date },
  ): Promise<AppointmentLike[]> {
    if (!this.allowRuntimeTifluxApi) {
      return [];
    }

    const allAppointments: AppointmentLike[] = [];
    let page = 1;
    const start_date = this.toDateOnlyISO(filters.startDate);
    const end_date = this.toDateOnlyISO(filters.endDate);

    while (page <= this.tifluxAppointmentsMaxPages) {
      const pageAppointments = await this.tifluxService.getTicketAppointments(
        ticketNumber,
        {
          offset: page,
          limit: this.tifluxAppointmentsPageSize,
          start_date,
          end_date,
        },
      );

      if (!this.loggedAppointmentSample && pageAppointments.length) {
        this.loggedAppointmentSample = true;
        this.devDebug('==================================================');
        this.devDebug('TIFLUX appointment sample (1º item)');
        this.devDebug(
          JSON.stringify(
            {
              ticketNumber,
              appointment: pageAppointments[0],
            },
            null,
            2,
          ),
        );
        this.devDebug('==================================================');
      }

      this.devDebug(
        `getAllAppointmentsForTicket ticket ${ticketNumber} página ${page}:`,
        pageAppointments.map((item) => ({
          date: item.date,
          init_time: item.init_time,
          end_time: item.end_time,
          minutes: this.getAppointmentMinutes(item),
        })),
      );

      if (!pageAppointments.length) {
        break;
      }

      allAppointments.push(...pageAppointments);

      if (pageAppointments.length < this.tifluxAppointmentsPageSize) {
        break;
      }

      page += 1;
    }

    this.devDebug(
      `getAllAppointmentsForTicket ticket ${ticketNumber} final:`,
      allAppointments.map((item) => ({
        date: item.date,
        init_time: item.init_time,
        end_time: item.end_time,
        minutes: this.getAppointmentMinutes(item),
      })),
    );

    return allAppointments;
  }

  private async getAppointmentsByTickets(
    tickets: Array<{ ticket_number: number } & Record<string, unknown>>,
    filters: { startDate: Date; endDate: Date },
  ): Promise<
    Array<{
      ticket: Record<string, unknown>;
      appointments: AppointmentLike[];
    }>
  > {
    const results: Array<{
      ticket: Record<string, unknown>;
      appointments: AppointmentLike[];
    }> = [];

    for (
      let index = 0;
      index < tickets.length;
      index += this.tifluxAppointmentsBatchSize
    ) {
      const batch = tickets.slice(
        index,
        index + this.tifluxAppointmentsBatchSize,
      );

      const batchResults = await Promise.all(
        batch.map(async (ticket) => {
          try {
            const appointments = await this.getAllAppointmentsForTicket(
              ticket.ticket_number,
              filters,
            );

            return {
              ticket: ticket as Record<string, unknown>,
              appointments,
            };
          } catch (error) {
            console.error(
              `Erro ao buscar appointments do ticket ${ticket.ticket_number}:`,
              error,
            );

            return {
              ticket: ticket as Record<string, unknown>,
              appointments: [],
            };
          }
        }),
      );

      results.push(...batchResults);

      const hasMoreBatches =
        index + this.tifluxAppointmentsBatchSize < tickets.length;

      if (hasMoreBatches) {
        await this.sleep(this.tifluxAppointmentsPauseMs);
      }
    }

    this.devDebug(
      'getAppointmentsByTickets final:',
      results.map((item) => ({
        ticket_number: item.ticket.ticket_number,
        title: item.ticket.title,
        client: item.ticket.client,
        appointments: item.appointments.map((a) => ({
          date: a.date,
          init_time: a.init_time,
          end_time: a.end_time,
          minutes: this.getAppointmentMinutes(a),
        })),
      })),
    );

    return results;
  }

  private async getAppointmentsByClientFromDb(params: {
    tifluxClientId: number;
    startDate: Date;
    endDate: Date;
  }): Promise<{
    tickets: Array<{ ticket_number: number } & Record<string, unknown>>;
    appointmentsByTicket: Array<{
      ticket: Record<string, unknown>;
      appointments: AppointmentLike[];
    }>;
    cacheMaxAppointmentDate: Date | null;
    coversRequestedEndDate: boolean;
  }> {
    const startDateOnly = params.startDate.toISOString().slice(0, 10);
    const endDateOnly = params.endDate.toISOString().slice(0, 10);

    const cacheRangeRows =
      (await this.prisma.$queryRaw<Array<{ max_date: Date | null }>>`
      select max(a.appointment_date)::date as max_date
      from tiflux.ticket_appointments a
      where a.client_external_id = ${params.tifluxClientId}
    `) ?? [];

    const cacheMaxAppointmentDate = cacheRangeRows[0]?.max_date ?? null;
    const requestedEndDateOnly = new Date(params.endDate);
    requestedEndDateOnly.setHours(0, 0, 0, 0);
    const cacheMaxDateOnly = cacheMaxAppointmentDate
      ? new Date(cacheMaxAppointmentDate)
      : null;
    cacheMaxDateOnly?.setHours(0, 0, 0, 0);
    const coversRequestedEndDate = Boolean(
      cacheMaxDateOnly && cacheMaxDateOnly >= requestedEndDateOnly,
    );

    const rows =
      (await this.prisma.$queryRaw<
        Array<{
          ticket_number: number;
          title: string | null;
          desk_external_id: number | null;
          desk_name: string | null;
          appointment_id: number;
          appointment_date: string | null;
          init_time: string | null;
          end_time: string | null;
          description: string | null;
          client_external_id: number | null;
          client_name: string | null;
          user_external_id: number | null;
          user_name: string | null;
          valorization_raw: unknown | null;
        }>
      >`
      select
        a.ticket_number,
        t.title,
        t.desk_external_id,
        t.desk_name,
        a.external_id as appointment_id,
        a.appointment_date::text as appointment_date,
        a.init_time::text as init_time,
        a.end_time::text as end_time,
        a.description,
        a.client_external_id,
        a.client_name,
        a.user_external_id,
        a.user_name,
        a.valorization_raw
      from tiflux.ticket_appointments a
      left join tiflux.tickets t
        on t.ticket_number = a.ticket_number
      where a.client_external_id = ${params.tifluxClientId}
        and a.appointment_date between ${startDateOnly}::date and ${endDateOnly}::date
      order by a.ticket_number asc, a.appointment_date asc, a.external_id asc
    `) ?? [];

    const map = new Map<
      number,
      {
        ticket: Record<string, unknown>;
        appointments: AppointmentLike[];
      }
    >();

    for (const r of rows) {
      const key = Number(r.ticket_number);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          ticket: {
            ticket_number: key,
            title: r.title,
            desk: r.desk_external_id
              ? { id: r.desk_external_id, name: r.desk_name }
              : r.desk_name
                ? { id: null, name: r.desk_name }
                : null,
          },
          appointments: [],
        });
      }

      map.get(key)!.appointments.push({
        id: r.appointment_id,
        date: r.appointment_date,
        init_time: r.init_time,
        end_time: r.end_time,
        description: r.description ?? undefined,
        client:
          r.client_external_id || r.client_name
            ? {
                id: Number(r.client_external_id ?? 0),
                name: String(r.client_name ?? ''),
              }
            : null,
        user:
          r.user_external_id || r.user_name
            ? {
                id: Number(r.user_external_id ?? 0),
                name: String(r.user_name ?? ''),
              }
            : null,
        valorization: r.valorization_raw ?? undefined,
      } as any);
    }

    const appointmentsByTicket = Array.from(map.values());
    const tickets = appointmentsByTicket.map((t) => t.ticket as any);

    return {
      tickets,
      appointmentsByTicket,
      cacheMaxAppointmentDate,
      coversRequestedEndDate,
    };
  }

  /**
   * Resumo de tickets do dashboard a partir do sync em `tiflux.tickets` (sem chamar a API TiFlux).
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
    const countRows =
      (await this.prisma.$queryRaw<
        Array<{ total_all: number; total_open: number }>
      >`
        select
          count(*)::int as total_all,
          count(*) filter (
            where t.is_closed is null or t.is_closed = false
          )::int as total_open
        from tiflux.tickets t
        where t.client_external_id = ${params.tifluxClientId}
          and t.created_at_source is not null
          and t.created_at_source >= ${params.startISO}::timestamptz
          and t.created_at_source <= ${params.endISO}::timestamptz
      `) ?? [];

    const totalTickets = countRows[0]?.total_all ?? 0;
    const totalOpenTickets = countRows[0]?.total_open ?? 0;

    const listRows =
      (await this.prisma.$queryRaw<
        Array<{
          ticket_number: number;
          title: string | null;
          created_at_source: Date | null;
          client_external_id: number | null;
          client_name: string | null;
          desk_external_id: number | null;
          desk_name: string | null;
        }>
      >`
      select
        t.ticket_number,
        t.title,
        t.created_at_source,
        t.client_external_id,
        t.client_name,
        t.desk_external_id,
        t.desk_name
      from tiflux.tickets t
      where t.client_external_id = ${params.tifluxClientId}
        and t.created_at_source is not null
        and t.created_at_source >= ${params.startISO}::timestamptz
        and t.created_at_source <= ${params.endISO}::timestamptz
      order by t.created_at_source desc
    `) ?? [];

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

  private buildHoursRows(
    appointmentsByTicket: Array<{
      ticket: Record<string, unknown>;
      appointments: AppointmentLike[];
    }>,
    startDate: Date,
    endDate: Date,
    options: {
      preferReviewDate: boolean;
      requireReviewDateIfAny: boolean;
      /** Confia nos filtros da API (start_date/end_date nos apontamentos); bucket por `appointment.date`. */
      rawAggregation?: boolean;
    },
  ): MonthlyHoursRow[] {
    const rows = new Map<string, MonthlyHoursRow>();
    const totalMinutesByMonth = new Map<
      string,
      Record<DeskCategory, number> & { Total: number }
    >();

    for (const row of this.buildEmptyHoursRows(startDate, endDate)) {
      rows.set(row.monthKey, row);
      totalMinutesByMonth.set(row.monthKey, {
        ...emptyDeskCategoryCounts(),
        Total: 0,
      });
    }

    for (const item of appointmentsByTicket) {
      const category = this.categorizeTicket(item.ticket);

      for (const appointment of item.appointments) {
        if (options.rawAggregation) {
          const bucketDate = this.toDateOrNull(appointment.date);
          if (!bucketDate) {
            continue;
          }
          const monthKey = this.getMonthKey(bucketDate);
          const minutesRow = totalMinutesByMonth.get(monthKey);
          if (!minutesRow) {
            continue;
          }
          const minutes = this.getAppointmentMinutes(appointment);
          minutesRow[category] += minutes;
          minutesRow.Total += minutes;
          continue;
        }

        const hasAnyReviewDate = item.appointments.some((a) =>
          this.getAppointmentReviewDate(a),
        );
        const effective = this.getAppointmentEffectiveDate(appointment, {
          preferReviewDate: options.preferReviewDate,
        });

        if (options.requireReviewDateIfAny && hasAnyReviewDate) {
          if (effective.source !== 'review_date') {
            continue;
          }
        }

        if (
          !effective.date ||
          effective.date < startDate ||
          effective.date > endDate
        ) {
          continue;
        }

        const monthKey = this.getMonthKey(effective.date);
        const minutesRow = totalMinutesByMonth.get(monthKey);

        if (!minutesRow) {
          continue;
        }

        const minutes = this.getAppointmentMinutes(appointment);

        minutesRow[category] += minutes;
        minutesRow.Total += minutes;
      }
    }

    for (const [monthKey, minutesRow] of totalMinutesByMonth.entries()) {
      const row = rows.get(monthKey);

      if (!row) {
        continue;
      }

      row.Infraestrutura = Number((minutesRow.Infraestrutura / 60).toFixed(2));
      row.Sistema = Number((minutesRow.Sistema / 60).toFixed(2));
      row.NOC = Number((minutesRow.NOC / 60).toFixed(2));
      row.Rotinas = Number((minutesRow.Rotinas / 60).toFixed(2));
      row.Consult = Number((minutesRow.Consult / 60).toFixed(2));
      row.Total = Number((minutesRow.Total / 60).toFixed(2));
    }

    this.devDebug('buildHoursRows resultado:', Array.from(rows.values()));

    return Array.from(rows.values());
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

    for (const [monthKey, monthLabel] of this.buildMonthMap(
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

      const eventDate = this.toDateOrNull(
        new Date(Number(event.clock ?? 0) * 1000).toISOString(),
      );

      if (!eventDate || eventDate < startDate || eventDate > endDate) {
        continue;
      }

      const severity = Number(event.severity ?? 0);
      const monthKey = this.getMonthKey(eventDate);
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

    for (const [weekKey, weekLabel] of this.buildWeekMap(
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

      const eventDate = this.toDateOrNull(
        new Date(Number(event.clock ?? 0) * 1000).toISOString(),
      );

      if (!eventDate || eventDate < startDate || eventDate > endDate) {
        continue;
      }

      const severity = Number(event.severity ?? 0);
      const weekKey = this.getWeekKey(eventDate);
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

    for (const [monthKey, monthLabel] of this.buildMonthMap(
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

      const eventDate = this.toDateOrNull(
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

      const monthKey = this.getMonthKey(eventDate);
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

      const eventDate = this.toDateOrNull(
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

  private getDaysFromRange(startDate: Date, endDate: Date) {
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    return Math.max(diffDays, 1);
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
  private async loadOrReuseDashboardHours(
    scoped: DashboardFilters,
  ): Promise<DashboardHoursResponse> {
    const cacheKey = this.buildHoursCacheKey(scoped);

    const cached = this.getCachedHoursResponse(cacheKey);
    if (cached) {
      this.devDebug('getDashboardHours: retornando cache');
      return cached;
    }

    const existingInFlight = this.inFlightHoursRequests.get(cacheKey);
    if (existingInFlight) {
      this.devDebug('getDashboardHours: retornando request em andamento');
      return existingInFlight;
    }

    const promise = this.buildDashboardHours(scoped);

    this.inFlightHoursRequests.set(cacheKey, promise);

    try {
      const response = await promise;
      this.setCachedHoursResponse(cacheKey, response);
      return response;
    } finally {
      this.inFlightHoursRequests.delete(cacheKey);
    }
  }

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
    this.invalidateCache(scoped);
    return this.getCompleteDashboard(user, params, { includeHours: true });
  }

  async getDashboardHours(
    user: AuthenticatedRequestUser,
    params: DashboardFilters,
  ): Promise<DashboardHoursResponse> {
    const scoped = await this.scopeDashboardFilters(user, params);
    return this.loadOrReuseDashboardHours(scoped);
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
    const { startDate, endDate } = this.getRange(scoped.start, scoped.end);
    const days = this.getDaysFromRange(startDate, endDate);
    const integrations = await this.resolveIntegrations(scoped);
    const { startISO, endISO } = this.buildTifluxDateRange(startDate, endDate);
    const hoursDateOpts = this.getDashboardHoursDateOptions();

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

    const computeAppointmentsSummary = (source: Record<string, unknown[]>) => {
      let ticketsWithAppointments = 0;
      let totalAppointments = 0;
      let totalAppointmentsInRange = 0;
      let totalMinutesInRange = 0;
      let totalMinutesInRangeByReviewDate = 0;
      let totalAppointmentsWithReviewDateInRange = 0;

      const minutesByTicket: Array<{
        ticket_number: number;
        appointmentsInRange: number;
        minutesInRange: number;
        hhmm: string;
      }> = [];

      for (const [ticketNumberStr, appts] of Object.entries(source)) {
        const ticketNumber = Number(ticketNumberStr);
        if (!Array.isArray(appts) || !Number.isFinite(ticketNumber)) continue;

        totalAppointments += appts.length;
        if (appts.length) ticketsWithAppointments += 1;

        let ticketAppointmentsInRange = 0;
        let ticketMinutesInRange = 0;

        for (const raw of appts) {
          const appt = raw as AppointmentLike;
          const effective = this.getAppointmentEffectiveDate(appt, {
            preferReviewDate: hoursDateOpts.preferReviewDate,
          });

          const dateForRange =
            effective.source === 'none' ? null : effective.date;

          if (
            !dateForRange ||
            dateForRange < startDate ||
            dateForRange > endDate
          ) {
            continue;
          }

          ticketAppointmentsInRange += 1;
          totalAppointmentsInRange += 1;

          const minutes = this.getAppointmentMinutes(appt);
          ticketMinutesInRange += minutes;
          totalMinutesInRange += minutes;

          const reviewDate = this.getAppointmentReviewDate(appt);
          if (reviewDate && reviewDate >= startDate && reviewDate <= endDate) {
            totalAppointmentsWithReviewDateInRange += 1;
            totalMinutesInRangeByReviewDate += minutes;
          }
        }

        minutesByTicket.push({
          ticket_number: ticketNumber,
          appointmentsInRange: ticketAppointmentsInRange,
          minutesInRange: Math.trunc(ticketMinutesInRange),
          hhmm: this.formatMinutesToHHMM(ticketMinutesInRange),
        });
      }

      minutesByTicket.sort((a, b) => b.minutesInRange - a.minutesInRange);

      return {
        ticketsWithAppointments,
        totalAppointments,
        totalAppointmentsInRange,
        totalMinutesInRange: Math.trunc(totalMinutesInRange),
        totalHorasInRange: Number((totalMinutesInRange / 60).toFixed(2)),
        totalHorasFormatadasInRange:
          this.formatMinutesToHHMM(totalMinutesInRange),
        reviewDate: {
          preferReviewDate: hoursDateOpts.preferReviewDate,
          totalAppointmentsWithReviewDateInRange,
          totalMinutesInRangeByReviewDate: Math.trunc(
            totalMinutesInRangeByReviewDate,
          ),
          totalHorasInRangeByReviewDate: Number(
            (totalMinutesInRangeByReviewDate / 60).toFixed(2),
          ),
          totalHorasFormatadasInRangeByReviewDate: this.formatMinutesToHHMM(
            totalMinutesInRangeByReviewDate,
          ),
        },
        topTicketsByMinutesInRange: minutesByTicket.slice(0, 15),
      };
    };

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
    const { startDate, endDate } = this.getRange(params.start, params.end);
    const days = this.getDaysFromRange(startDate, endDate);
    const integrations = await this.resolveIntegrations(params);
    const { startISO, endISO } = this.buildTifluxDateRange(startDate, endDate);

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
              chartLimit: this.chartTicketsLimit,
            });

            if (this.allowRuntimeTifluxApi) {
              // Sanity-check opcional para ambientes onde fallback da API está habilitado.
              try {
                const tifluxListParams = {
                  filter_by: 'all' as const,
                  client_ids: [integrations.tifluxClientId],
                  date_type: 'created_at' as const,
                  start_datetime: startISO,
                  end_datetime: endISO,
                  // O portal tipicamente fica bem abaixo disso; 200 cobre os casos comuns (ex.: 65 tickets).
                  limit: 200,
                  offset: 1,
                };

                const [openCountApi, allPageApi] = await Promise.all([
                  this.tifluxService.getTicketsTotalItems({
                    filter_by: 'open',
                    client_ids: [integrations.tifluxClientId],
                    date_type: 'created_at',
                    start_datetime: startISO,
                    end_datetime: endISO,
                  }),
                  this.tifluxService.getTicketsWithTotal(tifluxListParams),
                ]);

                const apiTotal = Number(allPageApi.totalItems ?? 0) || 0;
                const apiOpen = Number(openCountApi ?? 0) || 0;
                const apiTickets = (allPageApi.tickets ?? []) as Array<
                  Record<string, unknown>
                >;

                const dbTotal = Number(fromDb.totalTickets ?? 0) || 0;

                // Se a API trouxer mais tickets que o banco, preferimos a API (dados mais completos).
                if (apiTotal > dbTotal) {
                  return {
                    ...fromDb,
                    totalTickets: apiTotal,
                    totalOpenTickets: apiOpen,
                    ticketsForCharts: apiTickets.slice(0, this.chartTicketsLimit),
                    ticketsForAggregation:
                      apiTickets.length &&
                      apiTickets.length >= Math.min(apiTotal, 200)
                        ? apiTickets
                        : fromDb.ticketsForAggregation,
                  };
                }
              } catch (apiCheckError) {
                console.error(
                  'Sanity-check TiFlux API falhou; mantendo banco:',
                  apiCheckError,
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
          const tifluxListParams = {
            filter_by: 'all' as const,
            client_ids: [integrations.tifluxClientId],
            date_type: 'created_at' as const,
            start_datetime: startISO,
            end_datetime: endISO,
            limit: this.chartTicketsLimit,
            offset: 1,
          };

          const [openCount, allPage] = await Promise.all([
            this.tifluxService.getTicketsTotalItems({
              filter_by: 'open',
              client_ids: [integrations.tifluxClientId],
              date_type: 'created_at',
              start_datetime: startISO,
              end_datetime: endISO,
            }),
            this.tifluxService.getTicketsWithTotal(tifluxListParams),
          ]);

          const recentTickets = allPage.tickets as Array<
            Record<string, unknown>
          >;
          const allCount = allPage.totalItems;

          this.devDebug('==================================================');
          this.devDebug('TIFLUX resumo rápido (API)');
          this.devDebug('totalTickets:', allCount);
          this.devDebug('totalOpenTickets:', openCount);
          this.devDebug(
            'ticketsForCharts:',
            recentTickets.map((ticket) => ({
              ticket_number: ticket.ticket_number,
              title: ticket.title,
              created_at: ticket.created_at,
              client: ticket.client,
              desk: ticket.desk,
            })),
          );
          this.devDebug('==================================================');

          return {
            ticketsForCharts: recentTickets,
            totalTickets: allCount,
            totalOpenTickets: openCount,
          };
        } catch (error) {
          console.error('Erro ao buscar dados rápidos do TiFlux:', error);
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

    const emptyHoursRows = this.buildEmptyHoursRows(startDate, endDate);

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
      const hoursPack = await this.loadOrReuseDashboardHours(params);
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
    };
  }

  private async buildDashboardHours(
    params: DashboardFilters,
  ): Promise<DashboardHoursResponse> {
    const { startDate, endDate } = this.getRange(params.start, params.end);
    const integrations = await this.resolveIntegrations(params);

    if (process.env.NODE_ENV !== 'production') {
      this.loggedAppointmentSample = false;
    }

    this.devDebug('==================================================');
    this.devDebug('buildDashboardHours INÍCIO');
    this.devDebug('params:', params);
    this.devDebug('startDate:', startDate.toISOString());
    this.devDebug('endDate:', endDate.toISOString());
    this.devDebug('integrations:', integrations);
    this.devDebug('==================================================');

    let tickets: Array<{ ticket_number: number } & Record<string, unknown>> =
      [];
    let appointmentsByTicket: Array<{
      ticket: Record<string, unknown>;
      appointments: AppointmentLike[];
    }> = [];

    let appointmentsParaResumo: Array<{
      ticket: Record<string, unknown>;
      appointments: AppointmentLike[];
    }> = [];

    const hoursDateOpts = this.getDashboardHoursDateOptions();

    try {
      if (integrations.tifluxClientId !== null) {
        let usedDbForHours = false;
        const useDbCache =
          !this.tifluxDashboardRawApi &&
          process.env.TIFLUX_USE_DB_CACHE !== 'false';
        if (useDbCache) {
          const fromDb = await this.getAppointmentsByClientFromDb({
            tifluxClientId: integrations.tifluxClientId,
            startDate,
            endDate,
          });
          const hasAppointmentsInPeriod =
            fromDb.appointmentsByTicket.length > 0;
          const dbCoverageOk =
            hasAppointmentsInPeriod &&
            (!this.dbCacheRequireFullEndCoverage ||
              fromDb.coversRequestedEndDate);

          if (dbCoverageOk) {
            if (
              hasAppointmentsInPeriod &&
              !fromDb.coversRequestedEndDate
            ) {
              this.devDebug(
                'HOURS (DB CACHE): sync sem cobrir fim do filtro; usando SQL do período (evita API por ticket)',
                {
                  appointmentsByTicket: fromDb.appointmentsByTicket.length,
                  cacheMaxAppointmentDate:
                    fromDb.cacheMaxAppointmentDate?.toISOString() ?? null,
                  requestedEndDate: endDate.toISOString(),
                },
              );
            } else {
              this.devDebug(
                'HOURS (DB CACHE) appointmentsByTicket:',
                fromDb.appointmentsByTicket.length,
              );
            }
            tickets = fromDb.tickets;
            appointmentsByTicket = fromDb.appointmentsByTicket;
            usedDbForHours = true;
          } else {
            this.devDebug(
              'HOURS (DB CACHE) sem apontamentos no período; usando API TiFlux',
              {
                appointmentsByTicket: fromDb.appointmentsByTicket.length,
                cacheMaxAppointmentDate:
                  fromDb.cacheMaxAppointmentDate?.toISOString() ?? null,
                requestedEndDate: endDate.toISOString(),
                requireFullEndCoverage: this.dbCacheRequireFullEndCoverage,
              },
            );
          }
        }

        if (!appointmentsByTicket.length) {
          tickets = await this.getTicketsForHours({
            appointmentRangeStart: startDate,
            appointmentRangeEnd: endDate,
            tifluxClientId: integrations.tifluxClientId,
          });

          this.devDebug(
            'TICKETS HOURS',
            tickets.map((ticket) => ({
              ticket_number: ticket.ticket_number,
              title: ticket.title,
              created_at: ticket.created_at,
              client: ticket.client,
              desk: ticket.desk,
            })),
          );

          appointmentsByTicket = await this.getAppointmentsByTickets(tickets, {
            startDate,
            endDate,
          });
        }

        appointmentsParaResumo = appointmentsByTicket.map((item) => ({
          ticket: item.ticket,
          appointments: [...item.appointments],
        }));

        if (!usedDbForHours && process.env.TIFLUX_USE_DB_CACHE !== 'false') {
          try {
            const dbResumo = await this.getAppointmentsByClientFromDb({
              tifluxClientId: integrations.tifluxClientId,
              startDate,
              endDate,
            });
            const resumoFromDbOk =
              dbResumo.appointmentsByTicket.length > 0 &&
              (!this.dbCacheRequireFullEndCoverage ||
                dbResumo.coversRequestedEndDate);
            if (resumoFromDbOk) {
              appointmentsParaResumo = dbResumo.appointmentsByTicket.map(
                (item) => ({
                  ticket: item.ticket,
                  appointments: [...item.appointments],
                }),
              );
            }
          } catch {
            /* mantém listagem já carregada */
          }
        }

        if (
          !this.tifluxDashboardRawApi &&
          this.hoursDropTicketsWithoutAppointmentsInPeriod
        ) {
          appointmentsByTicket = appointmentsByTicket
            .map((item) => ({
              ticket: item.ticket,
              // Para alinhar com relatórios operacionais do TiFlux (carga de trabalho / extrato):
              // - Respeitar o range do dashboard
              // - Excluir itens marcados como garantia
              // - Somar todas as horas restantes (não apenas HORA NORMAL/HORA EXTRA)
              appointments: this.filterAppointmentsExcludeGuarantee(
                this.filterAppointmentsByDashboardRange(
                  item.appointments,
                  startDate,
                  endDate,
                  hoursDateOpts,
                ),
              ),
            }))
            .filter((item) => item.appointments.length > 0);
        }

        if (process.env.NODE_ENV !== 'production') {
          // Sample completo do 1º appointment para validar campos (review_date etc).
          const first = appointmentsByTicket.find((t) => t.appointments.length)
            ?.appointments[0];
          if (first) {
            const effective = this.getAppointmentEffectiveDate(first, {
              preferReviewDate: hoursDateOpts.preferReviewDate,
            });
            this.devDebug('==================================================');
            this.devDebug('HOURS DEBUG appointment sample');
            this.devDebug(
              JSON.stringify(
                {
                  effectiveDate: effective.date?.toISOString() ?? null,
                  effectiveSource: effective.source,
                  reviewDate:
                    this.getAppointmentReviewDate(first)?.toISOString() ?? null,
                  appointment: first,
                },
                null,
                2,
              ),
            );
            this.devDebug('==================================================');
          }

          const serviceCount = new Map<string, number>();
          const minutesByTicket = new Map<number, number>();
          const largestAppointments: Array<{
            ticket: number;
            date: string | null;
            init: string | null;
            end: string | null;
            service: string;
            minutes: number;
          }> = [];
          let totalAppointments = 0;
          let withValorization = 0;
          for (const item of appointmentsByTicket) {
            for (const appt of item.appointments) {
              totalAppointments += 1;
              if (appt.valorization) withValorization += 1;
              const label = this.getAppointmentServiceLabel(appt).toUpperCase();
              serviceCount.set(label, (serviceCount.get(label) ?? 0) + 1);
              const minutes = this.getAppointmentMinutes(appt);
              const ticketNumber = Number(item.ticket.ticket_number ?? 0);
              minutesByTicket.set(
                ticketNumber,
                (minutesByTicket.get(ticketNumber) ?? 0) + minutes,
              );

              if (minutes >= 120) {
                largestAppointments.push({
                  ticket: ticketNumber,
                  date: appt.date ?? null,
                  init: appt.init_time ?? null,
                  end: appt.end_time ?? null,
                  service: label,
                  minutes,
                });
              }
            }
          }

          const top = Array.from(serviceCount.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);

          const topTickets = Array.from(minutesByTicket.entries())
            .filter(([ticket]) => ticket > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([ticket, minutes]) => ({
              ticket,
              minutes,
              hhmm: this.formatMinutesToHHMM(minutes),
            }));

          this.devDebug('HOURS DEBUG (serviços em appointments no range):', {
            totalAppointments,
            withValorization,
            topServices: top,
            topTickets,
            largestAppointments: largestAppointments
              .sort((a, b) => b.minutes - a.minutes)
              .slice(0, 10),
          });
        }

        this.devDebug(
          'HOURS DASHBOARD',
          appointmentsByTicket.map((item) => ({
            ticket_number: item.ticket.ticket_number,
            title: item.ticket.title,
            client: item.ticket.client,
            appointments: item.appointments.map((a) => ({
              date: a.date,
              init_time: a.init_time,
              end_time: a.end_time,
              minutes: this.getAppointmentMinutes(a),
            })),
          })),
        );
      } else {
        this.devDebug('buildDashboardHours: tifluxClientId nulo');
      }
    } catch (error) {
      console.error('Erro ao buscar horas do TiFlux:', error);
      tickets = [];
      appointmentsByTicket = [];
      appointmentsParaResumo = [];
    }

    const resumoHorasTrabalhadas =
      integrations.tifluxClientId !== null
        ? this.buildWorkHoursTifluxSummary(
            appointmentsParaResumo,
            startDate,
            endDate,
          )
        : null;

    const hoursRows = this.buildHoursRows(
      appointmentsByTicket,
      startDate,
      endDate,
      {
        ...hoursDateOpts,
        rawAggregation: this.tifluxDashboardRawApi,
      },
    );

    const totalMinutes = appointmentsByTicket.reduce((acc, item) => {
      return (
        acc +
        item.appointments.reduce((subAcc, appointment) => {
          return subAcc + this.getAppointmentMinutes(appointment);
        }, 0)
      );
    }, 0);

    const totalHoras = Number((totalMinutes / 60).toFixed(2));
    const totalHorasFormatadas = this.formatMinutesToHHMM(totalMinutes);

    // Modo default: tickets com após filtros (range, não-garantia, etc.). Modo RAW: tickets com ≥1 apontamento devolvido pela API.
    const totalTicketsConsiderados = appointmentsByTicket
      .filter((i) => i.appointments.length > 0)
      .map((i) => Number(i.ticket.ticket_number ?? 0))
      .filter((n) => Number.isFinite(n) && n > 0).length;

    this.devDebug('summary final hours:', {
      totalMinutes,
      totalHoras,
      totalHorasFormatadas,
      totalTicketsConsiderados,
    });

    return {
      filters: {
        group: integrations.zabbixGroupName,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        companyId: params.companyId ?? null,
      },
      summary: {
        totalHoras,
        totalHorasFormatadas,
        totalTicketsConsiderados,
      },
      horasPorMes: hoursRows,
      horasPorMesa: this.buildDeskSummaryFromAppointments(appointmentsByTicket),
      resumoHorasTrabalhadas,
    };
  }
}
