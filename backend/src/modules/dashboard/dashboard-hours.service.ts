import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { TifluxService } from '../tiflux/tiflux.service';
import {
  categorizeTicketByDesk,
  emptyDeskCategoryCounts,
  type DeskCategory,
} from './desk-categories';
import {
  buildMonthMap,
  buildTifluxDateRange,
  getMonthKey,
  getRange,
  normalizeRange,
  toDateFromUnknown,
  toDateOnlyISO,
  toDateOrNull,
} from './dashboard-date.utils';
import { DashboardIntegrationsService } from './dashboard-integrations.service';
import { isTicketsPortalCanonical } from '../tickets/tickets-portal.config';
import { serviceNameToValorizationRaw } from '../tickets/portal-appointment.helper';
import {
  parseCacheMaxEntries,
  parseCacheTtlMs,
  TtlLruCache,
} from '../../common/cache/ttl-lru-cache';
import type {
  AppointmentLike,
  DashboardFilters,
  DashboardHoursResponse,
  MonthlyHoursRow,
  WorkHoursTifluxAssistanceBucket,
  WorkHoursTifluxLine,
  WorkHoursTifluxSummary,
} from './dashboard.types';

@Injectable()
export class DashboardHoursService {
  private readonly logger = new Logger(DashboardHoursService.name);
  private readonly tifluxAppointmentsBatchSize = 1;
  private readonly tifluxAppointmentsPauseMs = 800;
  private readonly allowRuntimeTifluxApi =
    process.env.TIFLUX_RUNTIME_API === 'true';
  /** Cache em memória das horas (ms). Env: DASHBOARD_HOURS_CACHE_MS */
  private readonly hoursCacheTtlMs = parseCacheTtlMs(
    process.env.DASHBOARD_HOURS_CACHE_MS,
    10 * 60 * 1000,
    5_000,
    30 * 60_000,
  );
  /**
   * Cache L2 no Redis (compartilhado entre instâncias). Opt-in:
   * DASHBOARD_HOURS_REDIS_CACHE=true e REDIS_URL definido.
   */
  private readonly hoursRedisCacheEnabled =
    process.env.DASHBOARD_HOURS_REDIS_CACHE === 'true';
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
  private readonly hoursCache = new TtlLruCache<DashboardHoursResponse>(
    parseCacheMaxEntries(process.env.DASHBOARD_HOURS_CACHE_MAX, 60),
    this.hoursCacheTtlMs,
  );
  private readonly inFlightHoursRequests = new Map<
    string,
    Promise<DashboardHoursResponse>
  >();

  constructor(
    private readonly tifluxService: TifluxService,
    private readonly prisma: PrismaService,
    private readonly integrations: DashboardIntegrationsService,
    private readonly redis: RedisService,
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

  private redisHoursKey(cacheKey: string) {
    return `alleone:dashboard:hours:${cacheKey}`;
  }

  invalidateCache(params: DashboardFilters): void {
    const cacheKey = this.buildHoursCacheKey(params);
    this.hoursCache.delete(cacheKey);
    this.inFlightHoursRequests.delete(cacheKey);
    if (this.hoursRedisCacheEnabled) {
      void this.redis.del(this.redisHoursKey(cacheKey));
    }
  }

  getEmptyHoursRows(startDate: Date, endDate: Date): MonthlyHoursRow[] {
    return this.buildEmptyHoursRows(startDate, endDate);
  }

  async getDashboardHours(
    params: DashboardFilters,
  ): Promise<DashboardHoursResponse> {
    return this.loadOrReuseDashboardHours(params);
  }

  private getCachedHoursResponse(cacheKey: string) {
    return this.hoursCache.get(cacheKey);
  }

  private async getCachedHoursResponseAsync(cacheKey: string) {
    const memory = this.getCachedHoursResponse(cacheKey);
    if (memory) return memory;
    if (!this.hoursRedisCacheEnabled || !this.redis.isEnabled()) {
      return null;
    }
    const fromRedis = await this.redis.getJson<DashboardHoursResponse>(
      this.redisHoursKey(cacheKey),
    );
    if (fromRedis) {
      this.hoursCache.set(cacheKey, fromRedis);
    }
    return fromRedis;
  }

  private setCachedHoursResponse(
    cacheKey: string,
    data: DashboardHoursResponse,
  ): void {
    this.hoursCache.set(cacheKey, data);
    if (this.hoursRedisCacheEnabled && this.redis.isEnabled()) {
      const ttlSec = Math.max(1, Math.ceil(this.hoursCacheTtlMs / 1000));
      void this.redis.setJson(this.redisHoursKey(cacheKey), data, ttlSec);
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
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

  private getDashboardHoursDateOptions(): {
    preferReviewDate: boolean;
    requireReviewDateIfAny: boolean;
  } {
    if (this.hoursAppointmentDateOnly) {
      return { preferReviewDate: false, requireReviewDateIfAny: false };
    }
    return { preferReviewDate: true, requireReviewDateIfAny: true };
  }

  private buildTicketFetchWindowForHours(
    userStartDate: Date,
    userEndDate: Date,
  ): { ticketStart: Date; ticketEnd: Date } {
    const { startDate, endDate } = normalizeRange(userStartDate, userEndDate);
    const ticketStart = new Date(startDate);
    ticketStart.setDate(ticketStart.getDate() - this.hoursTicketLookbackDays);
    ticketStart.setHours(0, 0, 0, 0);
    return { ticketStart, ticketEnd: endDate };
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
      const d = toDateFromUnknown(c);
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

    const byDateField = toDateOrNull(appointment.date);
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

  private buildEmptyHoursRows(
    startDate: Date,
    endDate: Date,
  ): MonthlyHoursRow[] {
    return Array.from(buildMonthMap(startDate, endDate).entries()).map(
      ([monthKey, monthLabel]) => ({
        monthKey,
        monthLabel,
        ...emptyDeskCategoryCounts(),
        Total: 0,
      }),
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
    const d = toDateOrNull(String(dateStr ?? ''));
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
    const d = toDateOrNull(String(appointment.date ?? ''));
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
      hay.includes('external') ||
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
        const d = toDateOrNull(dateRaw);
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
    const { startISO, endISO } = buildTifluxDateRange(ticketStart, ticketEnd);

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
    const start_date = toDateOnlyISO(filters.startDate);
    const end_date = toDateOnlyISO(filters.endDate);

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

    if (isTicketsPortalCanonical()) {
      return this.getAppointmentsByClientFromPortal(params, startDateOnly, endDateOnly);
    }

    try {
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

      const fromTiflux = this.mapAppointmentRowsToByTicket(
        rows,
        cacheMaxAppointmentDate,
        coversRequestedEndDate,
      );

      // Inclui apontamentos PORTAL_ONLY (e pendentes sem id TiFlux) que o mirror não tem.
      try {
        const portalOnly = await this.getPortalOnlyAppointmentsByClient(
          params,
          startDateOnly,
          endDateOnly,
        );
        return this.mergeAppointmentByTicketResults(fromTiflux, portalOnly);
      } catch {
        return fromTiflux;
      }
    } catch {
      // Schema tiflux.* ausente — cai no portal.
      return this.getAppointmentsByClientFromPortal(
        params,
        startDateOnly,
        endDateOnly,
      );
    }
  }

  /** Apontamentos só do portal (não espelhados no TiFlux). */
  private async getPortalOnlyAppointmentsByClient(
    params: { tifluxClientId: number; endDate: Date },
    startDateOnly: string,
    endDateOnly: string,
  ) {
    const cacheRangeRows =
      (await this.prisma.$queryRaw<Array<{ max_date: Date | null }>>`
      select max(a.appointment_date)::date as max_date
      from portal_ticket_appointments a
      inner join portal_tickets t on t.ticket_number = a.ticket_number
      where t.client_external_id = ${params.tifluxClientId}
        and (a.sync_status = 'PORTAL_ONLY' OR a.tiflux_appointment_external_id IS NULL)
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
          service_name: string | null;
        }>
      >`
      select
        a.ticket_number,
        t.title,
        t.desk_external_id,
        t.desk_name,
        coalesce(a.tiflux_appointment_external_id, abs(hashtext(a.id)))::int as appointment_id,
        a.appointment_date::text as appointment_date,
        a.init_time as init_time,
        a.end_time as end_time,
        a.description,
        t.client_external_id,
        t.client_name,
        null::int as user_external_id,
        u.name as user_name,
        a.service_name
      from portal_ticket_appointments a
      inner join portal_tickets t on t.ticket_number = a.ticket_number
      left join users u on u.id = a.created_by
      where t.client_external_id = ${params.tifluxClientId}
        and a.appointment_date between ${startDateOnly}::date and ${endDateOnly}::date
        and (a.sync_status = 'PORTAL_ONLY' OR a.tiflux_appointment_external_id IS NULL)
      order by a.ticket_number asc, a.appointment_date asc, a.id asc
    `) ?? [];

    const mapped = rows.map((r) => ({
      ...r,
      valorization_raw: serviceNameToValorizationRaw(r.service_name),
    }));

    return this.mapAppointmentRowsToByTicket(
      mapped,
      cacheMaxAppointmentDate,
      coversRequestedEndDate,
    );
  }

  private mergeAppointmentByTicketResults(
    primary: {
      tickets: Array<{ ticket_number: number } & Record<string, unknown>>;
      appointmentsByTicket: Array<{
        ticket: Record<string, unknown>;
        appointments: AppointmentLike[];
      }>;
      cacheMaxAppointmentDate: Date | null;
      coversRequestedEndDate: boolean;
    },
    extra: {
      tickets: Array<{ ticket_number: number } & Record<string, unknown>>;
      appointmentsByTicket: Array<{
        ticket: Record<string, unknown>;
        appointments: AppointmentLike[];
      }>;
      cacheMaxAppointmentDate: Date | null;
      coversRequestedEndDate: boolean;
    },
  ) {
    const byTicket = new Map<
      number,
      {
        ticket: Record<string, unknown>;
        appointments: AppointmentLike[];
      }
    >();

    for (const row of primary.appointmentsByTicket) {
      const n = Number(row.ticket.ticket_number);
      byTicket.set(n, {
        ticket: row.ticket,
        appointments: [...row.appointments],
      });
    }
    for (const row of extra.appointmentsByTicket) {
      const n = Number(row.ticket.ticket_number);
      const existing = byTicket.get(n);
      if (!existing) {
        byTicket.set(n, {
          ticket: row.ticket,
          appointments: [...row.appointments],
        });
        continue;
      }
      const seen = new Set(
        existing.appointments.map((a) => Number((a as { id?: number }).id)),
      );
      for (const appt of row.appointments) {
        const id = Number((appt as { id?: number }).id);
        if (Number.isFinite(id) && seen.has(id)) continue;
        existing.appointments.push(appt);
      }
    }

    const appointmentsByTicket = [...byTicket.values()].sort(
      (a, b) =>
        Number(a.ticket.ticket_number) - Number(b.ticket.ticket_number),
    );
    const ticketMap = new Map<number, { ticket_number: number } & Record<string, unknown>>();
    for (const t of [...primary.tickets, ...extra.tickets]) {
      ticketMap.set(Number(t.ticket_number), t);
    }

    const maxDates = [
      primary.cacheMaxAppointmentDate,
      extra.cacheMaxAppointmentDate,
    ].filter((d): d is Date => Boolean(d));
    const cacheMaxAppointmentDate =
      maxDates.length > 0
        ? new Date(Math.max(...maxDates.map((d) => d.getTime())))
        : null;

    return {
      tickets: [...ticketMap.values()],
      appointmentsByTicket,
      cacheMaxAppointmentDate,
      coversRequestedEndDate:
        primary.coversRequestedEndDate || extra.coversRequestedEndDate,
    };
  }

  private async getAppointmentsByClientFromPortal(
    params: { tifluxClientId: number; endDate: Date },
    startDateOnly: string,
    endDateOnly: string,
  ): Promise<{
    tickets: Array<{ ticket_number: number } & Record<string, unknown>>;
    appointmentsByTicket: Array<{
      ticket: Record<string, unknown>;
      appointments: AppointmentLike[];
    }>;
    cacheMaxAppointmentDate: Date | null;
    coversRequestedEndDate: boolean;
  }> {
    const cacheRangeRows =
      (await this.prisma.$queryRaw<Array<{ max_date: Date | null }>>`
      select max(a.appointment_date)::date as max_date
      from portal_ticket_appointments a
      inner join portal_tickets t on t.ticket_number = a.ticket_number
      where t.client_external_id = ${params.tifluxClientId}
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
          service_name: string | null;
        }>
      >`
      select
        a.ticket_number,
        t.title,
        t.desk_external_id,
        t.desk_name,
        coalesce(a.tiflux_appointment_external_id, abs(hashtext(a.id)))::int as appointment_id,
        a.appointment_date::text as appointment_date,
        a.init_time as init_time,
        a.end_time as end_time,
        a.description,
        t.client_external_id,
        t.client_name,
        null::int as user_external_id,
        u.name as user_name,
        a.service_name
      from portal_ticket_appointments a
      inner join portal_tickets t on t.ticket_number = a.ticket_number
      left join users u on u.id = a.created_by
      where t.client_external_id = ${params.tifluxClientId}
        and a.appointment_date between ${startDateOnly}::date and ${endDateOnly}::date
      order by a.ticket_number asc, a.appointment_date asc, a.id asc
    `) ?? [];

    const mapped = rows.map((r) => ({
      ...r,
      valorization_raw: serviceNameToValorizationRaw(r.service_name),
    }));

    return this.mapAppointmentRowsToByTicket(
      mapped,
      cacheMaxAppointmentDate,
      coversRequestedEndDate,
    );
  }

  private mapAppointmentRowsToByTicket(
    rows: Array<{
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
    }>,
    cacheMaxAppointmentDate: Date | null,
    coversRequestedEndDate: boolean,
  ): {
    tickets: Array<{ ticket_number: number } & Record<string, unknown>>;
    appointmentsByTicket: Array<{
      ticket: Record<string, unknown>;
      appointments: AppointmentLike[];
    }>;
    cacheMaxAppointmentDate: Date | null;
    coversRequestedEndDate: boolean;
  } {
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
          const bucketDate = toDateOrNull(appointment.date);
          if (!bucketDate) {
            continue;
          }
          const monthKey = getMonthKey(bucketDate);
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

        const monthKey = getMonthKey(effective.date);
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

  async loadOrReuseDashboardHours(
    scoped: DashboardFilters,
  ): Promise<DashboardHoursResponse> {
    const cacheKey = this.buildHoursCacheKey(scoped);

    const cached = await this.getCachedHoursResponseAsync(cacheKey);
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

  private async buildDashboardHours(
    params: DashboardFilters,
  ): Promise<DashboardHoursResponse> {
    const { startDate, endDate } = getRange(params.start, params.end);
    const integrations = await this.integrations.resolveIntegrations(params);

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
            if (hasAppointmentsInPeriod && !fromDb.coversRequestedEndDate) {
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

  buildAppointmentsDebugSummary(
    source: Record<string, unknown[]>,
    startDate: Date,
    endDate: Date,
  ) {
    const hoursDateOpts = this.getDashboardHoursDateOptions();
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
  }
}
