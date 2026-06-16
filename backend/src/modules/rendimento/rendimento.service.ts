import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TifluxService } from '../tiflux/tiflux.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import type { RendimentoCalendarView } from './rendimento.dto';
import {
  analyzeRendimentoDay,
  GAP_ALERT_MINUTES,
  isRendimentoDateToday,
  LUNCH_MINUTES,
  type RendimentoDayInsightsDto,
  type RendimentoGapDto,
} from './rendimento-day-insights';
import {
  buildDayEventSourceKey,
  collectDayEventUpserts,
  normalizeClockTimeForDb,
  newDayEventId,
  type RendimentoDayEventRow,
  type RendimentoDayEventStatus,
  type UpsertDayEventInput,
} from './rendimento-day-events.helper';
import { computeUnionWorkedMinutes } from './rendimento-worked-minutes.helper';
import { resolvePayrollPeriodRange } from './rendimento-payroll-period.helper';
import { AuditService } from '../audit/audit.service';
import {
  RendimentoStoreService,
  type GapJustificationRow,
} from './rendimento-store.service';

export type { RendimentoDayInsightsDto, RendimentoGapDto };

export type RendimentoEntryDto = {
  id: number;
  date: string;
  initTime: string | null;
  endTime: string | null;
  minutes: number;
  hoursFormatted: string;
  ticketNumber: number;
  clientName: string | null;
  description: string | null;
  isOvertime: boolean;
  overtimeKind?: 'EXTRA' | 'PLANTAO' | null;
  valorizationServiceName?: string | null;
  dayEventId?: string | null;
  dayEventStatus?: RendimentoDayEventStatus | null;
  debitProtected?: boolean;
};

type RendimentoJustificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type RendimentoJustificationKind = 'ALERT' | 'VOLUNTARY';

export type RendimentoGapJustificationDto = {
  id: string;
  kind: RendimentoJustificationKind;
  status: RendimentoJustificationStatus;
  /** Tipo informado pelo colaborador (pode corrigir almoço vs alerta). */
  gapType: 'idle' | 'lunch';
  fromTime: string;
  toTime: string;
  gapMinutes: number;
  reason: string;
  debitOvertime: boolean;
  overtimeMinutes: number;
  createdBy: string;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
};

export type RendimentoDaySummaryDto = {
  date: string;
  totalMinutes: number;
  totalHoursFormatted: string;
  entries: RendimentoEntryDto[];
  insights: RendimentoDayInsightsDto;
  /** Avisos pontuais; quando aprovados, suprimem alertas idle sobrepostos na timeline. */
  voluntaryJustifications: RendimentoGapJustificationDto[];
};

export type RendimentoCollaboratorDto = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyName: string | null;
  status: UserStatus;
  tifluxUserId: number | null;
  tifluxUserName: string | null;
  monthTotalMinutes: number;
  monthTotalHoursFormatted: string;
};

export type RendimentoTimesheetDto = {
  userId: string;
  userName: string;
  view: RendimentoCalendarView;
  referenceDate: string;
  rangeStart: string;
  rangeEnd: string;
  totalMinutes: number;
  totalHoursFormatted: string;
  periodOvertimeMinutes: number;
  periodOvertimeFormatted: string;
  periodOvertimeRangeLabel: string;
  periodPlantaoMinutes: number;
  periodPlantaoFormatted: string;
  overtimeBalanceMinutes: number;
  overtimeBalanceFormatted: string;
  days: RendimentoDaySummaryDto[];
};

type AppointmentRow = {
  appointment_id: number;
  appointment_date: string;
  init_time: string | null;
  end_time: string | null;
  ticket_number: number;
  client_name: string | null;
  description: string | null;
  minutes: number;
  valorization_raw: unknown | null;
};

type TifluxUserLink = { id: number; name: string };

type TifluxUserDbRow = {
  external_id: number;
  name: string | null;
  email: string | null;
};

@Injectable()
export class RendimentoService {
  private readonly logger = new Logger(RendimentoService.name);
  private tifluxUserEmailMap: Map<string, TifluxUserLink> | null = null;
  private tifluxUserEmailMapLoadPromise: Promise<
    Map<string, TifluxUserLink>
  > | null = null;
  /**
   * Segurança/performance: evita fallback para API TiFlux durante uso do portal.
   * O portal deve ler do banco local sincronizado.
   * Para habilitar fallback temporário: TIFLUX_RUNTIME_API=true
   */
  private readonly allowRuntimeTifluxApi =
    process.env.TIFLUX_RUNTIME_API === 'true';

  constructor(
    private readonly prisma: PrismaService,
    private readonly tifluxService: TifluxService,
    private readonly audit: AuditService,
    private readonly rendimentoStore: RendimentoStoreService,
  ) {}

  formatMinutes(totalMinutes: number): string {
    const total = Math.max(0, Math.trunc(Number(totalMinutes) || 0));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private parseHHMMToMinutes(value: string): number {
    const raw = String(value || '').trim();
    const match = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.exec(raw);
    if (!match) {
      throw new BadRequestException(
        'Horário inválido. Use o formato HH:MM (24h).',
      );
    }
    const h = Number(match[1]);
    const m = Number(match[2]);
    return h * 60 + m;
  }

  private normalizeTimeHHMM(value: string): string {
    const total = this.parseHHMMToMinutes(value);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private assertCanManageTargetUser(
    actor: AuthenticatedRequestUser,
    targetUserId: string,
  ) {
    if (actor.role === 'ADMIN') return;
    if (actor.userId !== targetUserId) {
      throw new ForbiddenException(
        'Somente administradores podem agir sobre outro colaborador.',
      );
    }
  }

  private parseDateOnly(value?: string): Date {
    const raw = value?.trim();
    if (!raw) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today;
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!match) {
      throw new BadRequestException(
        'Parâmetro "date" inválido. Use o formato YYYY-MM-DD.',
      );
    }
    const parsed = new Date(`${raw}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Parâmetro "date" inválido.');
    }
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  private toDateOnlyString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private resolveRange(
    view: RendimentoCalendarView,
    reference: Date,
  ): { start: Date; end: Date } {
    const start = new Date(reference);
    const end = new Date(reference);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    if (view === 'day') {
      return { start, end };
    }

    if (view === 'week') {
      const day = start.getDay();
      start.setDate(start.getDate() - day);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 6);
      return { start, end };
    }

    // Mês: grade Dom–Sáb (inclui dias 26–30 do mês anterior na mesma tela)
    const monthStart = new Date(reference.getFullYear(), reference.getMonth(), 1);
    const monthEnd = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);
    start.setTime(monthStart.getTime());
    start.setDate(start.getDate() - start.getDay());
    end.setTime(monthEnd.getTime());
    end.setDate(end.getDate() + (6 - end.getDay()));
    return { start, end };
  }

  /** Limites do mês civil (só o mês exibido no título), para totais da grade. */
  private resolveCalendarMonthBounds(reference: Date): { start: Date; end: Date } {
    const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
    const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return { start, end };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private toTifluxUserLink(params: {
    id: number;
    name?: string | null;
  }): TifluxUserLink | null {
    const id = Number(params.id);
    if (Number.isNaN(id)) return null;
    return {
      id,
      name:
        String(params.name ?? '').trim() || `Usuário TiFlux ${id}`,
    };
  }

  private registerTifluxUserInMap(
    map: Map<string, TifluxUserLink>,
    user: { id: number; email?: string | null; name?: string | null },
  ): void {
    const email = user.email?.trim().toLowerCase();
    if (!email || map.has(email)) return;
    const link = this.toTifluxUserLink({ id: user.id, name: user.name });
    if (link) map.set(email, link);
  }

  private async loadTifluxUserEmailMapFromDb(): Promise<
    Map<string, TifluxUserLink>
  > {
    const map = new Map<string, TifluxUserLink>();
    try {
      const rows =
        (await this.prisma.$queryRaw<TifluxUserDbRow[]>`
        select external_id, name, email
        from tiflux.users
        where coalesce(active, true) = true
          and email is not null
          and trim(email) <> ''
      `) ?? [];

      for (const row of rows) {
        const email = row.email?.trim().toLowerCase();
        if (!email) continue;
        const link = this.toTifluxUserLink({
          id: Number(row.external_id),
          name: row.name,
        });
        if (link) map.set(email, link);
      }
    } catch {
      // Schema/tabela ausente: segue para API TiFlux.
    }
    return map;
  }

  private async loadTifluxUserEmailMapFromApi(): Promise<
    Map<string, TifluxUserLink>
  > {
    if (!this.allowRuntimeTifluxApi) {
      return new Map<string, TifluxUserLink>();
    }

    const map = new Map<string, TifluxUserLink>();

    for (const type of ['admin', 'attendant'] as const) {
      const users = await this.tifluxService.getUsersAll({
        active: true,
        type,
        limitPerPage: 100,
        maxPages: 50,
      });
      for (const user of users) {
        this.registerTifluxUserInMap(map, user);
      }
    }

    return map;
  }

  /** Agenda e-mail → usuário TiFlux (carrega uma vez por instância da API). */
  private async ensureTifluxUserEmailMap(): Promise<Map<string, TifluxUserLink>> {
    if (this.tifluxUserEmailMap) {
      return this.tifluxUserEmailMap;
    }

    if (this.tifluxUserEmailMapLoadPromise) {
      return this.tifluxUserEmailMapLoadPromise;
    }

    this.tifluxUserEmailMapLoadPromise = (async () => {
      const fromDb = await this.loadTifluxUserEmailMapFromDb();
      if (fromDb.size > 0) {
        return fromDb;
      }
      if (!this.allowRuntimeTifluxApi) {
        return fromDb;
      }
      return this.loadTifluxUserEmailMapFromApi();
    })();

    try {
      this.tifluxUserEmailMap = await this.tifluxUserEmailMapLoadPromise;
      return this.tifluxUserEmailMap;
    } catch {
      this.tifluxUserEmailMap = new Map();
      return this.tifluxUserEmailMap;
    } finally {
      this.tifluxUserEmailMapLoadPromise = null;
    }
  }

  private lookupTifluxUser(
    email: string,
    emailMap: Map<string, TifluxUserLink>,
  ): TifluxUserLink | null {
    return emailMap.get(this.normalizeEmail(email)) ?? null;
  }

  private async fetchAppointments(params: {
    tifluxUserId: number;
    start: Date;
    end: Date;
  }): Promise<AppointmentRow[]> {
    const startDate = this.toDateOnlyString(params.start);
    const endDate = this.toDateOnlyString(params.end);

    const rows =
      (await this.prisma.$queryRaw<AppointmentRow[]>`
      select
        a.external_id as appointment_id,
        a.appointment_date::text as appointment_date,
        a.init_time::text as init_time,
        a.end_time::text as end_time,
        a.ticket_number,
        a.client_name,
        a.description,
        a.valorization_raw,
        coalesce(
          case
            when a.init_time is null or a.end_time is null then 0
            when a.end_time::time >= a.init_time::time
              then extract(epoch from (a.end_time::time - a.init_time::time)) / 60
            else extract(epoch from ((a.end_time::time + interval '24 hours') - a.init_time::time)) / 60
          end,
          0
        )::int as minutes
      from tiflux.ticket_appointments a
      where a.user_external_id = ${params.tifluxUserId}
        and a.appointment_date::date between ${startDate}::date and ${endDate}::date
      order by a.appointment_date asc, a.init_time asc nulls last, a.external_id asc
    `) ?? [];

    return rows;
  }

  private async getOvertimeBalanceMinutes(userId: string): Promise<number> {
    const row = await this.prisma.rendimentoOvertimeBalance.findUnique({
      where: { userId },
      select: { minutes: true },
    });
    return row?.minutes ?? 0;
  }

  private async listJustifications(params: {
    userId: string;
    start: Date;
    end: Date;
  }): Promise<GapJustificationRow[]> {
    return this.rendimentoStore.listJustifications(params);
  }

  private mapJustificationDto(
    row: GapJustificationRow,
  ): RendimentoGapJustificationDto {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      gapType: row.gap_type,
      fromTime: row.from_time,
      toTime: row.to_time,
      gapMinutes: Number(row.gap_minutes) || 0,
      reason: row.reason,
      debitOvertime: Boolean(row.debit_overtime),
      overtimeMinutes: Number(row.overtime_minutes) || 0,
      createdBy: row.created_by,
      createdAt: row.created_at,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
    };
  }

  private normalizeBulkStatusFilters(
    filters?: Array<'PENDING' | 'APPROVED' | 'REJECTED'>,
  ): Array<'PENDING' | 'APPROVED' | 'REJECTED'> {
    const allowed = new Set(['PENDING', 'APPROVED', 'REJECTED']);
    const input = filters?.length ? filters : ['PENDING'];
    const unique = [
      ...new Set(
        input.filter((entry): entry is 'PENDING' | 'APPROVED' | 'REJECTED' =>
          allowed.has(entry),
        ),
      ),
    ];
    return unique.length ? unique : ['PENDING'];
  }

  private gapLabelForType(
    type: 'idle' | 'lunch',
    gapMinutes: number,
  ): string {
    if (type === 'lunch') {
      const h = Math.floor(gapMinutes / 60);
      const m = gapMinutes % 60;
      const formatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      return `Almoço (${formatted})`;
    }
    return `${gapMinutes} min sem registro de horas`;
  }

  private formatMinutesAsTime(totalMinutes: number): string {
    const clamped = Math.max(0, Math.trunc(totalMinutes));
    const wrapped = clamped % (24 * 60);
    const h = Math.floor(wrapped / 60);
    const m = wrapped % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private justificationSuffix(
    justification?: { status: RendimentoJustificationStatus },
  ): string {
    if (!justification) return '';
    if (justification.status === 'APPROVED') return ' · justificado';
    if (justification.status === 'PENDING') return ' · justificativa pendente';
    return ' · justificativa rejeitada';
  }

  private isUserClaimedLunchGap(gap: RendimentoGapDto): boolean {
    const justification = gap.justification;
    if (!justification || justification.kind === 'VOLUNTARY') return false;
    return (
      justification.gapType === 'lunch' &&
      (justification.status === 'APPROVED' ||
        justification.status === 'PENDING')
    );
  }

  /** Lacuna idle só existe se for estritamente maior que 1h (mesma regra do dia). */
  private demoteLunchGapToIdle(gap: RendimentoGapDto): RendimentoGapDto | null {
    if (gap.gapMinutes <= GAP_ALERT_MINUTES) {
      return null;
    }
    return {
      ...gap,
      type: 'idle',
      label: this.gapLabelForType('idle', gap.gapMinutes),
      justification: undefined,
    };
  }

  private filterSubThresholdIdleGaps(
    gaps: RendimentoGapDto[],
  ): RendimentoGapDto[] {
    return gaps.filter(
      (gap) =>
        gap.type !== 'idle' || gap.gapMinutes > GAP_ALERT_MINUTES,
    );
  }

  /**
   * Por dia: no máximo um almoço (justificado pelo colaborador tem prioridade)
   * e duração máxima de 1h30 — o excedente vira alerta de lacuna.
   */
  private normalizeLunchGaps(gaps: RendimentoGapDto[]): RendimentoGapDto[] {
    const claimedLunchIndices = gaps
      .map((gap, index) => (this.isUserClaimedLunchGap(gap) ? index : -1))
      .filter((index) => index >= 0);

    let normalized: RendimentoGapDto[] = [];
    for (let index = 0; index < gaps.length; index += 1) {
      const gap = gaps[index];
      if (gap.type !== 'lunch') {
        normalized.push(gap);
        continue;
      }
      if (!claimedLunchIndices.length) {
        normalized.push(gap);
        continue;
      }
      const primaryIdx = claimedLunchIndices[0];
      if (index === primaryIdx) {
        normalized.push(gap);
        continue;
      }
      const demoted = this.demoteLunchGapToIdle(gap);
      if (demoted) normalized.push(demoted);
    }

    const lunchIndices = normalized
      .map((gap, index) => (gap.type === 'lunch' ? index : -1))
      .filter((index) => index >= 0);

    if (lunchIndices.length > 1) {
      const keepIdx = lunchIndices[0];
      const next: RendimentoGapDto[] = [];
      for (let index = 0; index < normalized.length; index += 1) {
        const gap = normalized[index];
        if (gap.type !== 'lunch' || index === keepIdx) {
          next.push(gap);
          continue;
        }
        const demoted = this.demoteLunchGapToIdle(gap);
        if (demoted) next.push(demoted);
      }
      normalized = next;
    }

    const expanded: RendimentoGapDto[] = [];
    for (const gap of normalized) {
      if (gap.type !== 'lunch' || gap.gapMinutes <= LUNCH_MINUTES) {
        expanded.push(gap);
        continue;
      }

      const from = this.parseHHMMToMinutes(gap.fromTime);
      const to = this.parseHHMMToMinutes(gap.toTime);
      if (to <= from) {
        expanded.push(gap);
        continue;
      }

      const lunchEnd = from + LUNCH_MINUTES;
      const remainingMinutes = to - lunchEnd;
      const suffix = this.justificationSuffix(gap.justification);

      expanded.push({
        ...gap,
        type: 'lunch',
        fromTime: this.formatMinutesAsTime(from),
        toTime: this.formatMinutesAsTime(lunchEnd),
        gapMinutes: LUNCH_MINUTES,
        label: `${this.gapLabelForType('lunch', LUNCH_MINUTES)}${suffix}`,
      });

      if (remainingMinutes > GAP_ALERT_MINUTES) {
        expanded.push({
          type: 'idle',
          fromTime: this.formatMinutesAsTime(lunchEnd),
          toTime: this.formatMinutesAsTime(to),
          gapMinutes: remainingMinutes,
          label: this.gapLabelForType('idle', remainingMinutes),
        });
      }
    }

    return this.filterSubThresholdIdleGaps(
      expanded.sort((a, b) => a.fromTime.localeCompare(b.fromTime)),
    );
  }

  private overlaps(
    gapFrom: string,
    gapTo: string,
    justFrom: string,
    justTo: string,
  ): boolean {
    const a1 = this.parseHHMMToMinutes(gapFrom);
    const a2 = this.parseHHMMToMinutes(gapTo);
    const b1 = this.parseHHMMToMinutes(justFrom);
    const b2 = this.parseHHMMToMinutes(justTo);
    return Math.max(a1, b1) < Math.min(a2, b2);
  }

  private subtractIntervalFromSegment(
    segFrom: number,
    segTo: number,
    cutFrom: number,
    cutTo: number,
  ): Array<{ from: number; to: number }> {
    if (cutTo <= segFrom || cutFrom >= segTo) {
      return [{ from: segFrom, to: segTo }];
    }

    const parts: Array<{ from: number; to: number }> = [];
    if (cutFrom > segFrom) {
      parts.push({ from: segFrom, to: Math.min(cutFrom, segTo) });
    }
    if (cutTo < segTo) {
      parts.push({ from: Math.max(cutTo, segFrom), to: segTo });
    }
    return parts.filter((part) => part.to > part.from);
  }

  /**
   * Justificativa voluntária aprovada suprime só o trecho sobreposto do alerta;
   * o restante da lacuna continua como alerta (se > 1h).
   */
  private trimIdleGapsAroundApprovedVoluntary(
    gaps: RendimentoGapDto[],
    dayJustifications: GapJustificationRow[],
  ): RendimentoGapDto[] {
    const approvedVoluntary = dayJustifications.filter(
      (j) => j.kind === 'VOLUNTARY' && j.status === 'APPROVED',
    );
    if (!approvedVoluntary.length) return gaps;

    const result: RendimentoGapDto[] = [];

    for (const gap of gaps) {
      if (gap.type !== 'idle') {
        result.push(gap);
        continue;
      }

      if (
        gap.justification?.status === 'APPROVED' &&
        gap.justification.kind !== 'VOLUNTARY'
      ) {
        result.push(gap);
        continue;
      }

      const from = this.parseHHMMToMinutes(gap.fromTime);
      const to = this.parseHHMMToMinutes(gap.toTime);
      if (to <= from) continue;

      let segments: Array<{ from: number; to: number }> = [{ from, to }];
      for (const voluntary of approvedVoluntary) {
        const cutFrom = this.parseHHMMToMinutes(voluntary.from_time);
        const cutTo = this.parseHHMMToMinutes(voluntary.to_time);
        const next: Array<{ from: number; to: number }> = [];
        for (const segment of segments) {
          next.push(
            ...this.subtractIntervalFromSegment(
              segment.from,
              segment.to,
              cutFrom,
              cutTo,
            ),
          );
        }
        segments = next;
      }

      for (const segment of segments) {
        const gapMinutes = segment.to - segment.from;
        if (gapMinutes <= GAP_ALERT_MINUTES) continue;
        result.push({
          ...gap,
          type: 'idle',
          fromTime: this.formatMinutesAsTime(segment.from),
          toTime: this.formatMinutesAsTime(segment.to),
          gapMinutes,
          label: this.gapLabelForType('idle', gapMinutes),
          justification: undefined,
        });
      }
    }

    return this.filterSubThresholdIdleGaps(
      result.sort((a, b) => a.fromTime.localeCompare(b.fromTime)),
    );
  }

  private applyJustificationsToDay(
    date: string,
    insights: RendimentoDayInsightsDto,
    dayJustifications: GapJustificationRow[],
  ): RendimentoDayInsightsDto {
    const alertJustifications = dayJustifications.filter(
      (j) => j.kind !== 'VOLUNTARY',
    );

    const gaps = insights.gaps.map((gap) => {
      const matched = alertJustifications.find((j) => {
        if (j.from_time === gap.fromTime && j.to_time === gap.toTime) return true;
        return this.overlaps(gap.fromTime, gap.toTime, j.from_time, j.to_time);
      });
      if (!matched) return gap;

      const justification = this.mapJustificationDto(matched);
      const suffix =
        matched.status === 'APPROVED'
          ? ' · justificado'
          : matched.status === 'PENDING'
            ? ' · justificativa pendente'
            : ' · justificativa rejeitada';

      const userGapType = matched.gap_type as 'idle' | 'lunch';
      const effectiveType =
        matched.status === 'APPROVED' ? userGapType : gap.type;

      return {
        ...gap,
        type: effectiveType,
        label: `${this.gapLabelForType(effectiveType, gap.gapMinutes)}${suffix}`,
        justification,
      };
    });

    const normalizedGaps = this.normalizeLunchGaps(gaps);

    const gapsWithoutVoluntaryOverlap =
      this.trimIdleGapsAroundApprovedVoluntary(
        normalizedGaps,
        dayJustifications,
      );

    const hasIdleGapAlert = gapsWithoutVoluntaryOverlap.some((gap) => {
      if (gap.type !== 'idle' || gap.gapMinutes <= GAP_ALERT_MINUTES) return false;
      const justification = gap.justification;
      if (!justification) return true;
      if (justification.kind === 'VOLUNTARY') return false;
      return justification.status !== 'APPROVED';
    });

    return {
      ...insights,
      hasIdleGapAlert,
      hasExpectedLunch: gapsWithoutVoluntaryOverlap.some((g) => g.type === 'lunch'),
      gaps: gapsWithoutVoluntaryOverlap,
    };
  }

  private mapEntries(rows: AppointmentRow[]): RendimentoEntryDto[] {
    return rows.map((row) => ({
      id: Number(row.appointment_id),
      date: row.appointment_date,
      initTime: row.init_time,
      endTime: row.end_time,
      minutes: Number(row.minutes) || 0,
      hoursFormatted: this.formatMinutes(Number(row.minutes) || 0),
      ticketNumber: Number(row.ticket_number),
      clientName: row.client_name,
      description: row.description,
      isOvertime: false,
      overtimeKind: null,
      valorizationServiceName: null,
    }));
  }

  private buildDaySummary(
    date: string,
    dayRows: AppointmentRow[],
    justificationsByDate: Map<string, GapJustificationRow[]>,
  ): RendimentoDaySummaryDto {
    const baseEntries = this.mapEntries(dayRows);
    const valorizationById = new Map(
      dayRows.map((row) => [Number(row.appointment_id), row.valorization_raw]),
    );
    const { entries, insights } = analyzeRendimentoDay(
      baseEntries,
      valorizationById,
    );
    const totalMinutes = entries.reduce((sum, item) => sum + item.minutes, 0);
    const dateOnly = date.slice(0, 10);
    const dayJustifications = justificationsByDate.get(dateOnly) ?? [];
    const voluntaryJustifications = dayJustifications
      .filter((j) => j.kind === 'VOLUNTARY')
      .map((j) => this.mapJustificationDto(j));
    let patchedInsights = this.applyJustificationsToDay(
      dateOnly,
      insights,
      dayJustifications,
    );
    if (isRendimentoDateToday(dateOnly)) {
      patchedInsights = this.emptyGapInsights(patchedInsights);
    }
    return {
      date,
      totalMinutes,
      totalHoursFormatted: this.formatMinutes(totalMinutes),
      entries,
      insights: patchedInsights,
      voluntaryJustifications,
    };
  }

  private emptyGapInsights(
    insights: RendimentoDayInsightsDto,
  ): RendimentoDayInsightsDto {
    return {
      ...insights,
      gaps: [],
      hasIdleGapAlert: false,
      hasExpectedLunch: false,
    };
  }

  private yesterdayDateOnly(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 1);
    return d;
  }

  private stripTodayGapAlerts(
    days: RendimentoDaySummaryDto[],
  ): RendimentoDaySummaryDto[] {
    return days.map((day) => {
      const dateOnly = day.date.slice(0, 10);
      if (!isRendimentoDateToday(dateOnly)) return day;
      return {
        ...day,
        insights: this.emptyGapInsights(day.insights),
      };
    });
  }

  private groupByDay(
    rows: AppointmentRow[],
    justificationsByDate: Map<string, GapJustificationRow[]>,
  ): RendimentoDaySummaryDto[] {
    const map = new Map<string, AppointmentRow[]>();

    for (const row of rows) {
      const key = row.appointment_date;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(row);
    }

    for (const dateOnly of justificationsByDate.keys()) {
      if (!map.has(dateOnly)) {
        map.set(dateOnly, []);
      }
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayRows]) =>
        this.buildDaySummary(date, dayRows, justificationsByDate),
      );
  }

  private async getProtectedOvertimeMinutes(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    const rows =
      (await this.prisma.$queryRawUnsafe<Array<{ total: number }>>(
        `
        SELECT COALESCE(SUM(minutes), 0)::int AS total
        FROM rendimento_day_events
        WHERE user_id = $1
          AND date_ref BETWEEN $2::date AND $3::date
          AND event_type IN ('OVERTIME', 'PLANTAO')
          AND status = 'APPROVED'
          AND debit_protected = true
          AND deleted_at IS NULL
      `,
        userId,
        this.toDateOnlyString(periodStart),
        this.toDateOnlyString(periodEnd),
      )) ?? [];
    return Number(rows[0]?.total) || 0;
  }

  private async getDebitedOvertimeMinutes(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    const rows =
      (await this.prisma.$queryRawUnsafe<Array<{ total: number }>>(
        `
        SELECT COALESCE(SUM(overtime_minutes), 0)::int AS total
        FROM rendimento_gap_justifications
        WHERE user_id = $1
          AND date_ref BETWEEN $2::date AND $3::date
          AND status = 'APPROVED'
          AND debit_overtime = true
          AND deleted_at IS NULL
      `,
        userId,
        this.toDateOnlyString(periodStart),
        this.toDateOnlyString(periodEnd),
      )) ?? [];
    return Number(rows[0]?.total) || 0;
  }

  private getDebitableOvertimeMinutes(
    periodOvertimeMinutes: number,
    protectedMinutes: number,
    debitedMinutes: number,
  ): number {
    return Math.max(
      0,
      Math.trunc(periodOvertimeMinutes) -
        Math.trunc(protectedMinutes) -
        Math.trunc(debitedMinutes),
    );
  }

  private async refreshOvertimeBalance(
    userId: string,
    periodOvertimeMinutes: number,
    referenceDate: Date,
  ): Promise<number> {
    const payroll = resolvePayrollPeriodRange(referenceDate);
    const protectedMinutes = await this.getProtectedOvertimeMinutes(
      userId,
      payroll.start,
      payroll.end,
    );
    const debitedMinutes = await this.getDebitedOvertimeMinutes(
      userId,
      payroll.start,
      payroll.end,
    );
    const available = this.getDebitableOvertimeMinutes(
      periodOvertimeMinutes,
      protectedMinutes,
      debitedMinutes,
    );
    await this.prisma.$executeRawUnsafe(
      `
      INSERT INTO rendimento_overtime_balances (user_id, minutes, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET minutes = $2, updated_at = NOW()
    `,
      userId,
      available,
    );
    return available;
  }

  private async upsertDayEvent(input: UpsertDayEventInput): Promise<string> {
    const fromTime = normalizeClockTimeForDb(input.fromTime);
    const toTime = normalizeClockTimeForDb(input.toTime);
    const sourceKey = buildDayEventSourceKey({
      eventType: input.eventType,
      dateRef: input.dateRef,
      fromTime,
      toTime,
      appointmentExternalId: input.appointmentExternalId,
      justificationId: input.justificationId,
    });

    const existing =
      (await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          status: RendimentoDayEventStatus;
          debit_protected: boolean;
          event_type: string;
        }>
      >(
        `
        SELECT id, status, debit_protected, event_type
        FROM rendimento_day_events
        WHERE user_id = $1
          AND source_key = $2
        ORDER BY deleted_at NULLS FIRST
        LIMIT 1
      `,
        input.userId,
        sourceKey,
      )) ?? [];

    const current = existing[0];
    if (current) {
      const lockedOvertime =
        (current.event_type === 'OVERTIME' ||
          current.event_type === 'PLANTAO') &&
        current.status === 'APPROVED' &&
        current.debit_protected;

      if (lockedOvertime) {
        return current.id;
      }
    }

    const status = input.status ?? current?.status ?? 'ACTIVE';
    const debitProtected =
      input.debitProtected ?? current?.debit_protected ?? false;
    const id = current?.id ?? newDayEventId();
    const minutes = Math.max(0, Math.trunc(input.minutes));
    const dateRef = input.dateRef.slice(0, 10);

    const upserted =
      (await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `
        INSERT INTO rendimento_day_events (
          id, user_id, date_ref, event_type, from_time, to_time, minutes,
          appointment_external_id, justification_id, label, description, reason,
          status, debit_protected, source_key
        ) VALUES (
          $1, $2, $3::date, $4, $5::time, $6::time, $7,
          $8, $9, $10, $11, $12,
          $13, $14, $15
        )
        ON CONFLICT (user_id, source_key) DO UPDATE SET
          from_time = EXCLUDED.from_time,
          to_time = EXCLUDED.to_time,
          minutes = EXCLUDED.minutes,
          appointment_external_id = EXCLUDED.appointment_external_id,
          justification_id = EXCLUDED.justification_id,
          label = EXCLUDED.label,
          description = EXCLUDED.description,
          reason = EXCLUDED.reason,
          status = EXCLUDED.status,
          debit_protected = EXCLUDED.debit_protected,
          deleted_at = NULL,
          updated_at = NOW()
        WHERE NOT (
          rendimento_day_events.event_type IN ('OVERTIME', 'PLANTAO')
          AND rendimento_day_events.status = 'APPROVED'
          AND rendimento_day_events.debit_protected = true
        )
        RETURNING id
      `,
        id,
        input.userId,
        dateRef,
        input.eventType,
        fromTime,
        toTime,
        minutes,
        input.appointmentExternalId ?? null,
        input.justificationId ?? null,
        input.label ?? null,
        input.description ?? null,
        input.reason ?? null,
        status,
        debitProtected,
        sourceKey,
      )) ?? [];

    if (upserted[0]?.id) {
      return upserted[0].id;
    }

    return current?.id ?? id;
  }

  private async purgeAutoGapEventsForDay(
    userId: string,
    dateRef: string,
  ): Promise<number> {
    const rows =
      (await this.prisma.$queryRawUnsafe<Array<{ count: number }>>(
        `
        WITH deleted AS (
          DELETE FROM rendimento_day_events
          WHERE user_id = $1
            AND date_ref = $2::date
            AND event_type IN ('IDLE_ALERT', 'LUNCH')
            AND status = 'ACTIVE'
          RETURNING id
        )
        SELECT COUNT(*)::int AS count FROM deleted
      `,
        userId,
        dateRef.slice(0, 10),
      )) ?? [];
    return Number(rows[0]?.count) || 0;
  }

  private async purgeAutoGapEventsInRange(
    userId: string,
    start: Date,
    end: Date,
  ): Promise<number> {
    const rows =
      (await this.prisma.$queryRawUnsafe<Array<{ count: number }>>(
        `
        WITH deleted AS (
          DELETE FROM rendimento_day_events
          WHERE user_id = $1
            AND date_ref BETWEEN $2::date AND $3::date
            AND event_type IN ('IDLE_ALERT', 'LUNCH')
            AND status = 'ACTIVE'
          RETURNING id
        )
        SELECT COUNT(*)::int AS count FROM deleted
      `,
        userId,
        this.toDateOnlyString(start),
        this.toDateOnlyString(end),
      )) ?? [];
    return Number(rows[0]?.count) || 0;
  }

  private async syncDayEventsForDays(
    userId: string,
    days: RendimentoDaySummaryDto[],
  ): Promise<void> {
    for (const day of days) {
      if (!day.insights) continue;
      await this.purgeAutoGapEventsForDay(userId, day.date);
      if (isRendimentoDateToday(day.date.slice(0, 10))) {
        continue;
      }
      const upserts = collectDayEventUpserts({
        userId,
        dateRef: day.date,
        insights: day.insights,
        entries: day.entries,
      });
      for (const item of upserts) {
        await this.upsertDayEvent(item);
      }
      for (const voluntary of day.voluntaryJustifications ?? []) {
        await this.upsertDayEvent({
          userId,
          dateRef: day.date,
          eventType: 'JUSTIFICATION',
          fromTime: voluntary.fromTime,
          toTime: voluntary.toTime,
          minutes: voluntary.gapMinutes,
          justificationId: voluntary.id,
          label: 'Justificativa voluntária',
          reason: voluntary.reason,
          status:
            voluntary.status === 'APPROVED'
              ? 'APPROVED'
              : voluntary.status === 'REJECTED'
                ? 'REJECTED'
                : 'PENDING',
        });
      }
    }
  }

  /**
   * Recalcula alertas/almoço persistidos com as regras atuais (remove órfãos e re-sincroniza).
   * Apenas ADMIN. Não altera HE/plantão/justificativas já decididas.
   */
  async reprocessGapAlerts(params: {
    actor: AuthenticatedRequestUser;
    userId?: string;
    from?: string;
    to?: string;
  }) {
    if (params.actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Somente administrador pode reprocessar alertas.',
      );
    }

    let end = params.to
      ? this.parseDateOnly(params.to)
      : this.yesterdayDateOnly();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (end >= today) {
      end = this.yesterdayDateOnly();
    }
    const start = params.from
      ? this.parseDateOnly(params.from)
      : new Date(end.getFullYear(), end.getMonth() - 6, end.getDate());

    if (start > end) {
      throw new BadRequestException('Data inicial não pode ser maior que a final.');
    }

    const collaborators = await this.listCollaboratorsForSelect();
    const targets = params.userId
      ? collaborators.filter((c) => c.id === params.userId)
      : collaborators.filter((c) => c.tifluxUserId != null);

    if (params.userId && targets.length === 0) {
      throw new NotFoundException(
        'Colaborador não encontrado ou sem vínculo TiFlux.',
      );
    }

    const tifluxUserByEmail = await this.ensureTifluxUserEmailMap();
    let usersProcessed = 0;
    let daysProcessed = 0;
    let eventsPurged = 0;
    let eventsUpserted = 0;

    const errors: string[] = [];

    for (const collaborator of targets) {
      try {
        const tifluxUser = this.lookupTifluxUser(
          collaborator.email,
          tifluxUserByEmail,
        );
        if (!tifluxUser) continue;

        eventsPurged += await this.purgeAutoGapEventsInRange(
          collaborator.id,
          start,
          end,
        );

        const rows = await this.fetchAppointments({
          tifluxUserId: tifluxUser.id,
          start,
          end,
        });
        const justifications = await this.listJustifications({
          userId: collaborator.id,
          start,
          end,
        });
        const justificationsByDate = new Map<string, GapJustificationRow[]>();
        for (const item of justifications) {
          const key = item.date_ref.slice(0, 10);
          if (!justificationsByDate.has(key)) {
            justificationsByDate.set(key, []);
          }
          justificationsByDate.get(key)!.push(item);
        }

        const days = this.groupByDay(rows, justificationsByDate);
        daysProcessed += days.length;
        for (const day of days) {
          if (!day.insights) continue;
          if (isRendimentoDateToday(day.date.slice(0, 10))) continue;
          const upserts = collectDayEventUpserts({
            userId: collaborator.id,
            dateRef: day.date,
            insights: day.insights,
            entries: day.entries,
          });
          eventsUpserted += upserts.filter(
            (item) =>
              item.eventType === 'IDLE_ALERT' || item.eventType === 'LUNCH',
          ).length;
        }
        await this.syncDayEventsForDays(collaborator.id, days);
        usersProcessed += 1;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Erro desconhecido ao reprocessar.';
        errors.push(`${collaborator.name}: ${msg}`);
      }
    }

    if (usersProcessed === 0 && errors.length > 0) {
      throw new BadRequestException(errors.join(' | '));
    }

    return {
      usersProcessed,
      daysProcessed,
      eventsPurged,
      eventsUpserted,
      rangeStart: this.toDateOnlyString(start),
      rangeEnd: this.toDateOnlyString(end),
      errors: errors.length ? errors : undefined,
      message:
        errors.length > 0
          ? `Reprocessamento parcial: ${usersProcessed} colaborador(es) OK; ${errors.length} falha(s).`
          : 'Alertas recalculados com as regras atuais. Abra a agenda de cada colaborador para conferir.',
    };
  }

  private async listDayEvents(params: {
    userId: string;
    start: Date;
    end: Date;
  }): Promise<RendimentoDayEventRow[]> {
    return this.rendimentoStore.listDayEvents(params);
  }

  private attachDayEventsToDays(
    days: RendimentoDaySummaryDto[],
    events: RendimentoDayEventRow[],
  ): void {
    const byAppointment = new Map<number, RendimentoDayEventRow>();
    for (const event of events) {
      if (event.appointment_external_id != null) {
        byAppointment.set(Number(event.appointment_external_id), event);
      }
    }

    for (const day of days) {
      day.entries = day.entries.map((entry) => {
        const event = byAppointment.get(entry.id);
        if (!event) return entry;
        return {
          ...entry,
          dayEventId: event.id,
          dayEventStatus: event.status,
          debitProtected: event.debit_protected,
        };
      });
    }
  }

  private async computeOvertimeMinutesForUser(
    userId: string,
    start: Date,
    end: Date,
  ): Promise<number> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { email: true },
    });
    if (!user) return 0;

    const tifluxUserByEmail = await this.ensureTifluxUserEmailMap();
    const tifluxUser = this.lookupTifluxUser(user.email, tifluxUserByEmail);
    if (tifluxUser == null) return 0;

    const payroll = resolvePayrollPeriodRange(new Date());
    const rows = await this.fetchAppointments({
      tifluxUserId: tifluxUser.id,
      start: payroll.start,
      end: payroll.end,
    });
    return computeUnionWorkedMinutes(rows, 'EXTRA');
  }

  private currentMonthRange(): { start: Date; end: Date } {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const start = new Date(now);
    start.setDate(1);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1, 0);
    return { start, end };
  }

  /** Lista rápida para selects (relatórios) — sem totais do mês. */
  async listCollaboratorsForSelect(options?: {
    includePj?: boolean;
  }): Promise<RendimentoCollaboratorDto[]> {
    const roles = options?.includePj
      ? [UserRole.ADMIN, UserRole.COLLABORATOR, UserRole.PJ]
      : [UserRole.ADMIN, UserRole.COLLABORATOR];

    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: UserStatus.ACTIVE,
        role: { in: roles },
      },
      include: { company: true },
      orderBy: { name: 'asc' },
    });

    const tifluxUserByEmail = await this.ensureTifluxUserEmailMap();

    return users.map((user) => {
      const tifluxUser = this.lookupTifluxUser(user.email, tifluxUserByEmail);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyName: user.company?.name ?? null,
        status: user.status,
        tifluxUserId: tifluxUser?.id ?? null,
        tifluxUserName: tifluxUser?.name ?? null,
        monthTotalMinutes: 0,
        monthTotalHoursFormatted: this.formatMinutes(0),
      };
    });
  }

  async listCollaborators(): Promise<RendimentoCollaboratorDto[]> {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: UserStatus.ACTIVE,
        role: { in: [UserRole.ADMIN, UserRole.COLLABORATOR] }, // PJ não entra na lista de Rendimento
      },
      include: { company: true },
      orderBy: { name: 'asc' },
    });

    const { start, end } = this.currentMonthRange();
    const tifluxUserByEmail = await this.ensureTifluxUserEmailMap();
    const collaborators: RendimentoCollaboratorDto[] = [];

    for (const user of users) {
      const tifluxUser = this.lookupTifluxUser(user.email, tifluxUserByEmail);
      let monthTotalMinutes = 0;

      if (tifluxUser != null) {
        const monthRows = await this.fetchAppointments({
          tifluxUserId: tifluxUser.id,
          start,
          end,
        });
        monthTotalMinutes = computeUnionWorkedMinutes(monthRows, 'ALL');
      }

      collaborators.push({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyName: user.company?.name ?? null,
        status: user.status,
        tifluxUserId: tifluxUser?.id ?? null,
        tifluxUserName: tifluxUser?.name ?? null,
        monthTotalMinutes,
        monthTotalHoursFormatted: this.formatMinutes(monthTotalMinutes),
      });
    }

    return collaborators;
  }

  async getTimesheet(params: {
    actor: AuthenticatedRequestUser;
    userId: string;
    view: RendimentoCalendarView;
    date?: string;
  }): Promise<RendimentoTimesheetDto> {
    this.assertCanManageTargetUser(params.actor, params.userId);
    const user = await this.prisma.user.findFirst({
      where: {
        id: params.userId,
        deletedAt: null,
        role: { in: [UserRole.ADMIN, UserRole.COLLABORATOR, UserRole.PJ] },
      },
    });

    if (!user) {
      throw new NotFoundException('Colaborador não encontrado.');
    }

    const reference = this.parseDateOnly(params.date);
    const { start, end } = this.resolveRange(params.view, reference);
    const tifluxUserByEmail = await this.ensureTifluxUserEmailMap();
    const tifluxUser = this.lookupTifluxUser(user.email, tifluxUserByEmail);

    if (tifluxUser == null) {
      const overtimeBalanceMinutes = await this.getOvertimeBalanceMinutes(user.id);
      return {
        userId: user.id,
        userName: user.name,
        view: params.view,
        referenceDate: this.toDateOnlyString(reference),
        rangeStart: this.toDateOnlyString(start),
        rangeEnd: this.toDateOnlyString(end),
        totalMinutes: 0,
        totalHoursFormatted: this.formatMinutes(0),
        periodOvertimeMinutes: 0,
        periodOvertimeFormatted: this.formatMinutes(0),
        periodOvertimeRangeLabel: resolvePayrollPeriodRange(reference).label,
        periodPlantaoMinutes: 0,
        periodPlantaoFormatted: this.formatMinutes(0),
        overtimeBalanceMinutes,
        overtimeBalanceFormatted: this.formatMinutes(overtimeBalanceMinutes),
        days: [],
      };
    }

    const payrollPeriod = resolvePayrollPeriodRange(reference);

    const rows = await this.fetchAppointments({
      tifluxUserId: tifluxUser.id,
      start,
      end,
    });
    const justifications = await this.listJustifications({
      userId: user.id,
      start,
      end,
    });
    const justificationsByDate = new Map<string, GapJustificationRow[]>();
    for (const item of justifications) {
      const key = item.date_ref.slice(0, 10);
      if (!justificationsByDate.has(key)) {
        justificationsByDate.set(key, []);
      }
      justificationsByDate.get(key)!.push(item);
    }
    let days = this.groupByDay(rows, justificationsByDate);
    if (params.view === 'day') {
      const refKey = this.toDateOnlyString(reference);
      if (!days.some((d) => d.date.slice(0, 10) === refKey)) {
        days = [
          this.buildDaySummary(refKey, [], justificationsByDate),
          ...days,
        ];
      }
    }
    try {
      await this.syncDayEventsForDays(user.id, days);
    } catch (err) {
      this.logger.error(
        `Falha ao sincronizar eventos de rendimento (user=${user.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    const dayEvents = await this.listDayEvents({ userId: user.id, start, end });
    this.attachDayEventsToDays(days, dayEvents);

    const payrollRows = await this.fetchAppointments({
      tifluxUserId: tifluxUser.id,
      start: payrollPeriod.start,
      end: payrollPeriod.end,
    });

    let totalMinutes = computeUnionWorkedMinutes(rows, 'ALL');
    if (params.view === 'month') {
      const cal = this.resolveCalendarMonthBounds(reference);
      const calStart = this.toDateOnlyString(cal.start);
      const calEnd = this.toDateOnlyString(cal.end);
      const monthRows = rows.filter((row) => {
        const day = String(row.appointment_date).slice(0, 10);
        return day >= calStart && day <= calEnd;
      });
      totalMinutes = computeUnionWorkedMinutes(monthRows, 'ALL');
    }

    const periodOvertimeMinutes = computeUnionWorkedMinutes(
      payrollRows,
      'EXTRA',
    );
    const periodPlantaoMinutes = computeUnionWorkedMinutes(payrollRows, 'PLANTAO');
    const overtimeBalanceMinutes = await this.refreshOvertimeBalance(
      user.id,
      periodOvertimeMinutes,
      reference,
    );

    const timesheetDays = this.stripTodayGapAlerts(
      user.role === UserRole.PJ ? this.stripPjTimesheetDays(days) : days,
    );

    return {
      userId: user.id,
      userName: user.name,
      view: params.view,
      referenceDate: this.toDateOnlyString(reference),
      rangeStart: this.toDateOnlyString(start),
      rangeEnd: this.toDateOnlyString(end),
      totalMinutes,
      totalHoursFormatted: this.formatMinutes(totalMinutes),
      periodOvertimeMinutes,
      periodOvertimeFormatted: this.formatMinutes(periodOvertimeMinutes),
      periodOvertimeRangeLabel: payrollPeriod.label,
      periodPlantaoMinutes,
      periodPlantaoFormatted: this.formatMinutes(periodPlantaoMinutes),
      overtimeBalanceMinutes,
      overtimeBalanceFormatted: this.formatMinutes(overtimeBalanceMinutes),
      days: timesheetDays,
    };
  }

  /** Terceiro (PJ): só apontamentos + HE/plantão — sem lacunas, almoço ou justificativas. */
  private stripPjTimesheetDays(
    days: RendimentoDaySummaryDto[],
  ): RendimentoDaySummaryDto[] {
    return days.map((day) => ({
      ...day,
      voluntaryJustifications: [],
      insights: {
        ...day.insights,
        gaps: [],
        hasIdleGapAlert: false,
        hasExpectedLunch: false,
      },
    }));
  }

  async createGapJustification(params: {
    actor: AuthenticatedRequestUser;
    userId: string;
    date: string;
    fromTime: string;
    toTime: string;
    gapType: 'idle' | 'lunch';
    gapMinutes: number;
    kind: 'ALERT' | 'VOLUNTARY';
    reason: string;
    debitOvertime?: boolean;
    overtimeMinutes?: number;
  }) {
    this.assertCanManageTargetUser(params.actor, params.userId);

    const user = await this.prisma.user.findFirst({
      where: { id: params.userId, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('Colaborador não encontrado.');
    }

    const date = this.toDateOnlyString(this.parseDateOnly(params.date));
    const fromTime = this.normalizeTimeHHMM(params.fromTime);
    const toTime = this.normalizeTimeHHMM(params.toTime);
    const fromMinutes = this.parseHHMMToMinutes(fromTime);
    const toMinutes = this.parseHHMMToMinutes(toTime);
    if (toMinutes <= fromMinutes) {
      throw new BadRequestException(
        'Horário final deve ser maior que o horário inicial.',
      );
    }

    const reason = String(params.reason || '').trim();
    if (!reason) {
      throw new BadRequestException('Justificativa é obrigatória.');
    }

    const gapMinutesPreview =
      Number(params.gapMinutes) > 0
        ? Math.trunc(Number(params.gapMinutes))
        : toMinutes - fromMinutes;
    if (
      params.kind !== 'VOLUNTARY' &&
      params.gapType === 'lunch' &&
      gapMinutesPreview > LUNCH_MINUTES
    ) {
      throw new BadRequestException(
        'Período de almoço não pode exceder 1h30.',
      );
    }

    const gapMinutes =
      Number(params.gapMinutes) > 0
        ? Math.trunc(Number(params.gapMinutes))
        : toMinutes - fromMinutes;
    const debitOvertime = Boolean(params.debitOvertime);
    const overtimeMinutes = debitOvertime
      ? Math.max(0, Math.trunc(Number(params.overtimeMinutes) || gapMinutes))
      : 0;

    const id = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `
      INSERT INTO rendimento_gap_justifications (
        id, user_id, date_ref, from_time, to_time, gap_type, gap_minutes, kind, status,
        reason, debit_overtime, overtime_minutes, created_by
      ) VALUES (
        $1, $2, $3::date, $4::time, $5::time, $6, $7, $8, 'PENDING',
        $9, $10, $11, $12
      )
    `,
      id,
      params.userId,
      date,
      fromTime,
      toTime,
      params.gapType,
      gapMinutes,
      params.kind,
      reason,
      debitOvertime,
      overtimeMinutes,
      params.actor.userId,
    );

    await this.upsertDayEvent({
      userId: params.userId,
      dateRef: date,
      eventType: 'JUSTIFICATION',
      fromTime,
      toTime,
      minutes: gapMinutes,
      justificationId: id,
      label:
        params.kind === 'VOLUNTARY'
          ? 'Justificativa voluntária'
          : this.gapLabelForType(params.gapType, gapMinutes),
      reason,
      status: 'PENDING',
    });

    return { id, status: 'PENDING' as const };
  }

  async decideDayEvent(params: {
    actor: AuthenticatedRequestUser;
    eventId: string;
    decision: 'APPROVED' | 'REJECTED';
  }) {
    if (params.actor.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Somente administradores podem aprovar horas extras ou plantão.',
      );
    }

    const rows =
      (await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          user_id: string;
          event_type: string;
          status: RendimentoDayEventStatus;
        }>
      >(
        `
        SELECT id, user_id, event_type, status
        FROM rendimento_day_events
        WHERE id = $1 AND deleted_at IS NULL
      `,
        params.eventId,
      )) ?? [];
    const current = rows[0];
    if (!current) {
      throw new NotFoundException('Registro de rendimento não encontrado.');
    }
    if (current.event_type !== 'OVERTIME' && current.event_type !== 'PLANTAO') {
      throw new BadRequestException(
        'Somente hora extra ou plantão podem ser aprovados neste fluxo.',
      );
    }
    if (current.status !== 'PENDING') {
      throw new BadRequestException('Este registro já foi decidido.');
    }

    const debitProtected = params.decision === 'APPROVED';
    await this.prisma.$executeRawUnsafe(
      `
      UPDATE rendimento_day_events
      SET status = $2,
          debit_protected = $3,
          approved_by = $4,
          approved_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `,
      params.eventId,
      params.decision,
      debitProtected,
      params.actor.userId,
    );

    await this.audit.log({
      actor: params.actor,
      action: 'APPROVE_OVERTIME_OR_PLANTAO',
      entity: 'RendimentoDayEvent',
      entityId: params.eventId,
      payload: {
        before: current,
        after: {
          id: params.eventId,
          status: params.decision,
          debitProtected,
          approvedBy: params.actor.userId,
        },
      },
    });

    const payroll = resolvePayrollPeriodRange(new Date());
    const periodOvertimeMinutes = await this.computeOvertimeMinutesForUser(
      current.user_id,
      payroll.start,
      payroll.end,
    );
    await this.refreshOvertimeBalance(
      current.user_id,
      periodOvertimeMinutes,
      new Date(),
    );

    return {
      id: params.eventId,
      status: params.decision,
      debitProtected,
    };
  }

  async decideGapJustification(params: {
    actor: AuthenticatedRequestUser;
    justificationId: string;
    decision: 'APPROVED' | 'REJECTED';
    note?: string;
  }) {
    if (params.actor.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Somente administradores podem aprovar/rejeitar justificativas.',
      );
    }

    const rows =
      (await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          user_id: string;
          status: RendimentoJustificationStatus;
          debit_overtime: boolean;
          overtime_minutes: number;
        }>
      >(
        `
        SELECT id, user_id, status, debit_overtime, overtime_minutes
        FROM rendimento_gap_justifications
        WHERE id = $1
          AND deleted_at IS NULL
      `,
        params.justificationId,
      )) ?? [];
    const current = rows[0];
    if (!current) {
      throw new NotFoundException('Justificativa não encontrada.');
    }
    if (current.status !== 'PENDING') {
      throw new BadRequestException('Justificativa já foi decidida.');
    }

    if (params.decision === 'APPROVED' && current.debit_overtime) {
      const debit = Math.max(
        0,
        Math.trunc(Number(current.overtime_minutes) || 0),
      );
      const payroll = resolvePayrollPeriodRange(new Date());
      const periodOvertimeMinutes = await this.computeOvertimeMinutesForUser(
        current.user_id,
        payroll.start,
        payroll.end,
      );
      const protectedMinutes = await this.getProtectedOvertimeMinutes(
        current.user_id,
        payroll.start,
        payroll.end,
      );
      const debitedMinutes = await this.getDebitedOvertimeMinutes(
        current.user_id,
        payroll.start,
        payroll.end,
      );
      const debitable = this.getDebitableOvertimeMinutes(
        periodOvertimeMinutes,
        protectedMinutes,
        debitedMinutes,
      );
      if (debit > debitable) {
        throw new BadRequestException(
          `Não é possível debitar ${this.formatMinutes(debit)} em horas extras. ` +
            `Disponível para débito: ${this.formatMinutes(debitable)}. ` +
            `Horas extras ou plantão já aprovados pelo administrador não podem ser debitados.`,
        );
      }
    }

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE rendimento_gap_justifications
      SET status = $2,
          note = $3,
          approved_by = $4,
          approved_at = NOW()
      WHERE id = $1
    `,
      params.justificationId,
      params.decision,
      String(params.note || '').trim() || null,
      params.actor.userId,
    );

    await this.audit.log({
      actor: params.actor,
      action: 'DECIDE_JUSTIFICATION',
      entity: 'RendimentoGapJustification',
      entityId: params.justificationId,
      payload: {
        before: current,
        after: {
          id: params.justificationId,
          status: params.decision,
          note: params.note ?? null,
          approvedBy: params.actor.userId,
        },
      },
    });

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE rendimento_day_events
      SET status = $2,
          debit_protected = false,
          approved_by = $3,
          approved_at = NOW(),
          updated_at = NOW()
      WHERE justification_id = $1
        AND event_type = 'JUSTIFICATION'
        AND deleted_at IS NULL
    `,
      params.justificationId,
      params.decision,
      params.actor.userId,
    );

    const payroll = resolvePayrollPeriodRange(new Date());
    const periodOvertimeMinutes = await this.computeOvertimeMinutesForUser(
      current.user_id,
      payroll.start,
      payroll.end,
    );
    await this.refreshOvertimeBalance(
      current.user_id,
      periodOvertimeMinutes,
      new Date(),
    );

    return { id: params.justificationId, status: params.decision };
  }

  async listPendingJustifications(params: {
    start: string;
    end: string;
    userId?: string;
    statusFilters?: Array<'PENDING' | 'APPROVED' | 'REJECTED'>;
  }) {
    const start = params.start.slice(0, 10);
    const end = params.end.slice(0, 10);
    const userId = params.userId?.trim() || null;
    const statusFilters = this.normalizeBulkStatusFilters(params.statusFilters);

    const rows =
      (await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          user_id: string;
          user_email: string;
          date_ref: string;
          from_time: string | null;
          to_time: string | null;
          gap_type: string;
          gap_minutes: number;
          kind: RendimentoJustificationKind;
          reason: string;
          debit_overtime: boolean;
          overtime_minutes: number;
          company_name: string | null;
          status: RendimentoJustificationStatus;
          approved_by_name: string | null;
          approved_at: string | null;
        }>
      >(
        `
        SELECT
          j.id,
          j.user_id,
          u.email AS user_email,
          j.date_ref::text AS date_ref,
          j.from_time::text AS from_time,
          j.to_time::text AS to_time,
          j.gap_type,
          j.gap_minutes,
          j.kind,
          j.reason,
          j.debit_overtime,
          j.overtime_minutes,
          co.name AS company_name,
          j.status,
          approver.name AS approved_by_name,
          j.approved_at::text AS approved_at
        FROM rendimento_gap_justifications j
        INNER JOIN users u ON u.id = j.user_id AND u.deleted_at IS NULL
        LEFT JOIN companies co ON co.id = u.company_id
        LEFT JOIN users approver ON approver.id = j.approved_by
        WHERE j.deleted_at IS NULL
          AND j.date_ref >= $1::date
          AND j.date_ref <= $2::date
          AND ($3::text IS NULL OR j.user_id = $3::text)
          AND j.status = ANY($4::text[])
        ORDER BY
          CASE j.status
            WHEN 'PENDING' THEN 0
            WHEN 'APPROVED' THEN 1
            WHEN 'REJECTED' THEN 2
            ELSE 3
          END,
          j.date_ref DESC,
          u.email ASC,
          j.from_time ASC NULLS LAST
      `,
        start,
        end,
        userId,
        statusFilters,
      )) ?? [];

    return rows.map((row) => {
      const gapMinutes = Number(row.gap_minutes) || 0;
      const gapType = row.gap_type === 'lunch' ? 'lunch' : 'idle';
      const kind = row.kind === 'VOLUNTARY' ? 'VOLUNTARY' : 'ALERT';

      return {
        id: row.id,
        userId: row.user_id,
        userEmail: row.user_email,
        date: row.date_ref.slice(0, 10),
        fromTime: row.from_time?.slice(0, 5) ?? null,
        toTime: row.to_time?.slice(0, 5) ?? null,
        gapType,
        gapTypeLabel:
          gapType === 'lunch'
            ? 'Almoço'
            : 'Intervalo sem apontamento',
        gapMinutes,
        gapLabel: this.gapLabelForType(gapType, gapMinutes),
        kind,
        kindLabel: kind === 'VOLUNTARY' ? 'Voluntária' : 'Alerta',
        reason: row.reason?.trim() || '',
        debitOvertime: Boolean(row.debit_overtime),
        overtimeMinutes: Number(row.overtime_minutes) || 0,
        overtimeFormatted: this.formatMinutes(
          Number(row.overtime_minutes) || 0,
        ),
        companyName: row.company_name?.trim() || null,
        status: row.status,
        approvedByName: row.approved_by_name?.trim() || null,
        approvedAt: row.approved_at ?? null,
      };
    });
  }

  async bulkDecideGapJustifications(params: {
    actor: AuthenticatedRequestUser;
    ids: string[];
    decision: 'APPROVED' | 'REJECTED';
    note?: string;
  }) {
    const uniqueIds = [...new Set(params.ids.map((id) => id.trim()).filter(Boolean))];
    const results: Array<{
      id: string;
      ok: boolean;
      status?: 'APPROVED' | 'REJECTED';
      error?: string;
    }> = [];

    for (const id of uniqueIds) {
      try {
        const res = await this.decideGapJustification({
          actor: params.actor,
          justificationId: id,
          decision: params.decision,
          note: params.note,
        });
        results.push({ id, ok: true, status: res.status });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Falha ao decidir justificativa.';
        results.push({ id, ok: false, error: message });
      }
    }

    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.length - succeeded;

    return {
      decision: params.decision,
      total: results.length,
      succeeded,
      failed,
      results,
    };
  }

  async listPendingOvertimeEvents(params: {
    start: string;
    end: string;
    userId?: string;
    statusFilters?: Array<'PENDING' | 'APPROVED' | 'REJECTED'>;
  }) {
    const start = params.start.slice(0, 10);
    const end = params.end.slice(0, 10);
    const userId = params.userId?.trim() || null;
    const statusFilters = this.normalizeBulkStatusFilters(params.statusFilters);

    const rows =
      (await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          user_id: string;
          user_email: string;
          date_ref: string;
          event_type: 'OVERTIME' | 'PLANTAO';
          from_time: string | null;
          to_time: string | null;
          minutes: number;
          label: string | null;
          description: string | null;
          appointment_external_id: number | null;
          ticket_number: number | null;
          company_name: string | null;
          status: string;
          approved_by_name: string | null;
          approved_at: string | null;
        }>
      >(
        `
        SELECT
          e.id,
          e.user_id,
          u.email AS user_email,
          e.date_ref::text AS date_ref,
          e.event_type,
          e.from_time::text AS from_time,
          e.to_time::text AS to_time,
          e.minutes,
          e.label,
          e.description,
          e.appointment_external_id,
          ta.ticket_number,
          COALESCE(co_ticket.name, ta.client_name, co_user.name) AS company_name,
          e.status,
          approver.name AS approved_by_name,
          e.approved_at::text AS approved_at
        FROM rendimento_day_events e
        INNER JOIN users u ON u.id = e.user_id AND u.deleted_at IS NULL
        LEFT JOIN companies co_user ON co_user.id = u.company_id
        LEFT JOIN users approver ON approver.id = e.approved_by
        LEFT JOIN tiflux.ticket_appointments ta
          ON ta.external_id = e.appointment_external_id
        LEFT JOIN tiflux.tickets tk ON tk.ticket_number = ta.ticket_number
        LEFT JOIN companies co_ticket
          ON co_ticket.tiflux_client_id = COALESCE(tk.client_external_id, ta.client_external_id)
        WHERE e.deleted_at IS NULL
          AND e.event_type IN ('OVERTIME', 'PLANTAO')
          AND e.date_ref >= $1::date
          AND e.date_ref <= $2::date
          AND ($3::text IS NULL OR e.user_id = $3::text)
          AND e.status = ANY($4::text[])
        ORDER BY
          CASE e.status
            WHEN 'PENDING' THEN 0
            WHEN 'APPROVED' THEN 1
            WHEN 'REJECTED' THEN 2
            ELSE 3
          END,
          e.date_ref DESC,
          u.email ASC,
          e.from_time ASC NULLS LAST
      `,
        start,
        end,
        userId,
        statusFilters,
      )) ?? [];

    return rows.map((row) => {
      const minutes = Number(row.minutes) || 0;
      const appointmentExternalId =
        row.appointment_external_id != null
          ? Number(row.appointment_external_id)
          : null;
      const ticketNumber =
        row.ticket_number != null ? Number(row.ticket_number) : null;
      const companyName = row.company_name?.trim() || null;
      const rawDescription = row.description?.trim() || row.label?.trim() || null;

      return {
        id: row.id,
        userId: row.user_id,
        userEmail: row.user_email,
        date: row.date_ref.slice(0, 10),
        eventType: row.event_type,
        typeLabel: row.event_type === 'PLANTAO' ? 'Plantão' : 'Hora extra',
        fromTime: row.from_time?.slice(0, 5) ?? null,
        toTime: row.to_time?.slice(0, 5) ?? null,
        minutes,
        hoursFormatted: this.formatMinutes(minutes),
        label: row.label,
        description: rawDescription,
        appointmentExternalId,
        companyName,
        ticketNumber,
        status: row.status as 'PENDING' | 'APPROVED' | 'REJECTED',
        approvedByName: row.approved_by_name?.trim() || null,
        approvedAt: row.approved_at ?? null,
      };
    });
  }

  async bulkDecideDayEvents(params: {
    actor: AuthenticatedRequestUser;
    ids: string[];
    decision: 'APPROVED' | 'REJECTED';
  }) {
    const uniqueIds = [...new Set(params.ids.map((id) => id.trim()).filter(Boolean))];
    const results: Array<{
      id: string;
      ok: boolean;
      status?: 'APPROVED' | 'REJECTED';
      error?: string;
    }> = [];

    for (const id of uniqueIds) {
      try {
        const res = await this.decideDayEvent({
          actor: params.actor,
          eventId: id,
          decision: params.decision,
        });
        results.push({ id, ok: true, status: res.status });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Falha ao decidir registro.';
        results.push({ id, ok: false, error: message });
      }
    }

    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.length - succeeded;

    return {
      decision: params.decision,
      total: results.length,
      succeeded,
      failed,
      results,
    };
  }
}
