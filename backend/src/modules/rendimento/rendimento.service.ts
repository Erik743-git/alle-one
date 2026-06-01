import {
  BadRequestException,
  ForbiddenException,
  Injectable,
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
type GapJustificationRow = {
  id: string;
  user_id: string;
  date_ref: string;
  from_time: string;
  to_time: string;
  gap_type: 'idle' | 'lunch';
  gap_minutes: number;
  kind: RendimentoJustificationKind;
  status: RendimentoJustificationStatus;
  reason: string;
  debit_overtime: boolean;
  overtime_minutes: number;
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
};

type TifluxUserDbRow = {
  external_id: number;
  name: string | null;
  email: string | null;
};

@Injectable()
export class RendimentoService {
  private tifluxUserEmailMap: Map<string, TifluxUserLink> | null = null;
  private tifluxUserEmailMapLoadPromise: Promise<
    Map<string, TifluxUserLink>
  > | null = null;
  private ensureTablesPromise: Promise<void> | null = null;
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

  private async ensureRendimentoTables() {
    if (this.ensureTablesPromise) {
      await this.ensureTablesPromise;
      return;
    }
    this.ensureTablesPromise = (async () => {
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS rendimento_gap_justifications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          date_ref DATE NOT NULL,
          from_time TIME NOT NULL,
          to_time TIME NOT NULL,
          gap_type TEXT NOT NULL,
          gap_minutes INTEGER NOT NULL,
          kind TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING',
          reason TEXT NOT NULL,
          debit_overtime BOOLEAN NOT NULL DEFAULT false,
          overtime_minutes INTEGER NOT NULL DEFAULT 0,
          created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          approved_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
          approved_at TIMESTAMP NULL,
          note TEXT NULL,
          deleted_at TIMESTAMP NULL
        );
      `);
      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_rendimento_gap_justifications_user_date
        ON rendimento_gap_justifications (user_id, date_ref);
      `);
      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_rendimento_gap_justifications_status
        ON rendimento_gap_justifications (status);
      `);
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS rendimento_overtime_balances (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          minutes INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS rendimento_day_events (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          date_ref DATE NOT NULL,
          event_type TEXT NOT NULL,
          from_time TIME NULL,
          to_time TIME NULL,
          minutes INTEGER NOT NULL DEFAULT 0,
          appointment_external_id BIGINT NULL,
          justification_id TEXT NULL,
          label TEXT NULL,
          description TEXT NULL,
          reason TEXT NULL,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          debit_protected BOOLEAN NOT NULL DEFAULT false,
          source_key TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          approved_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
          approved_at TIMESTAMP NULL,
          deleted_at TIMESTAMP NULL,
          CONSTRAINT rendimento_day_events_type_chk CHECK (
            event_type IN ('IDLE_ALERT', 'LUNCH', 'JUSTIFICATION', 'OVERTIME', 'PLANTAO')
          ),
          CONSTRAINT rendimento_day_events_status_chk CHECK (
            status IN ('ACTIVE', 'PENDING', 'APPROVED', 'REJECTED')
          ),
          CONSTRAINT rendimento_day_events_user_source_uniq UNIQUE (user_id, source_key)
        );
      `);
      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_rendimento_day_events_user_date
        ON rendimento_day_events (user_id, date_ref);
      `);
      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_rendimento_day_events_type_status
        ON rendimento_day_events (event_type, status);
      `);
    })();
    await this.ensureTablesPromise;
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

    const payroll = resolvePayrollPeriodRange(reference);
    return { start: payroll.start, end: payroll.end };
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
    await this.ensureRendimentoTables();
    const rows =
      (await this.prisma.$queryRawUnsafe<Array<{ minutes: number }>>(
        `
        SELECT minutes
        FROM rendimento_overtime_balances
        WHERE user_id = $1
      `,
        userId,
      )) ?? [];
    return Number(rows[0]?.minutes) || 0;
  }

  private async listJustifications(params: {
    userId: string;
    start: Date;
    end: Date;
  }): Promise<GapJustificationRow[]> {
    await this.ensureRendimentoTables();
    const rows =
      (await this.prisma.$queryRawUnsafe<GapJustificationRow[]>(
        `
        SELECT
          j.id,
          j.user_id,
          j.date_ref::text as date_ref,
          to_char(j.from_time, 'HH24:MI') as from_time,
          to_char(j.to_time, 'HH24:MI') as to_time,
          j.gap_type,
          j.gap_minutes,
          j.kind,
          j.status,
          j.reason,
          j.debit_overtime,
          j.overtime_minutes,
          creator.name as created_by,
          j.created_at::text as created_at,
          approver.name as approved_by,
          j.approved_at::text as approved_at
        FROM rendimento_gap_justifications j
        INNER JOIN users creator ON creator.id = j.created_by
        LEFT JOIN users approver ON approver.id = j.approved_by
        WHERE j.user_id = $1
          AND j.deleted_at IS NULL
          AND j.date_ref BETWEEN $2::date AND $3::date
        ORDER BY j.date_ref ASC, j.from_time ASC, j.created_at DESC
      `,
        params.userId,
        this.toDateOnlyString(params.start),
        this.toDateOnlyString(params.end),
      )) ?? [];
    return rows;
  }

  private mapJustificationDto(
    row: GapJustificationRow,
  ): RendimentoGapJustificationDto {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      gapType: row.gap_type,
      reason: row.reason,
      debitOvertime: Boolean(row.debit_overtime),
      overtimeMinutes: Number(row.overtime_minutes) || 0,
      createdBy: row.created_by,
      createdAt: row.created_at,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
    };
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
    return `${gapMinutes} min sem apontamento`;
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

  private applyJustificationsToDay(
    date: string,
    insights: RendimentoDayInsightsDto,
    dayJustifications: GapJustificationRow[],
  ): RendimentoDayInsightsDto {
    const gaps = insights.gaps.map((gap) => {
      const matched = dayJustifications.find((j) => {
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

    const hasIdleGapAlert = gaps.some((gap) => {
      if (gap.type !== 'idle') return false;
      const justification = gap.justification;
      if (!justification) return true;
      if (justification.kind === 'VOLUNTARY') return false;
      return justification.status !== 'APPROVED';
    });

    return {
      ...insights,
      hasIdleGapAlert,
      hasExpectedLunch: gaps.some((g) => g.type === 'lunch'),
      gaps,
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

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayRows]) => {
        const baseEntries = this.mapEntries(dayRows);
        const valorizationById = new Map(
          dayRows.map((row) => [
            Number(row.appointment_id),
            row.valorization_raw,
          ]),
        );
        const { entries, insights } = analyzeRendimentoDay(
          baseEntries,
          valorizationById,
        );
        const totalMinutes = entries.reduce((sum, item) => sum + item.minutes, 0);
        const dateOnly = date.slice(0, 10);
        const dayJustifications = justificationsByDate.get(dateOnly) ?? [];
        const patchedInsights = this.applyJustificationsToDay(
          dateOnly,
          insights,
          dayJustifications,
        );
        return {
          date,
          totalMinutes,
          totalHoursFormatted: this.formatMinutes(totalMinutes),
          entries,
          insights: patchedInsights,
        };
      });
  }

  private async getProtectedOvertimeMinutes(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    await this.ensureRendimentoTables();
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
    await this.ensureRendimentoTables();
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
    await this.ensureRendimentoTables();
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
    await this.ensureRendimentoTables();
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
          AND deleted_at IS NULL
        LIMIT 1
      `,
        input.userId,
        sourceKey,
      )) ?? [];

    const current = existing[0];
    const status = input.status ?? current?.status ?? 'ACTIVE';
    const debitProtected =
      input.debitProtected ?? current?.debit_protected ?? false;

    if (current) {
      const lockedOvertime =
        (current.event_type === 'OVERTIME' ||
          current.event_type === 'PLANTAO') &&
        current.status === 'APPROVED' &&
        current.debit_protected;

      if (lockedOvertime) {
        return current.id;
      }

      await this.prisma.$executeRawUnsafe(
        `
        UPDATE rendimento_day_events
        SET
          from_time = $3::time,
          to_time = $4::time,
          minutes = $5,
          appointment_external_id = $6,
          justification_id = $7,
          label = $8,
          description = $9,
          reason = $10,
          status = $11,
          debit_protected = $12,
          updated_at = NOW()
        WHERE id = $1 AND user_id = $2
      `,
        current.id,
        input.userId,
        fromTime,
        toTime,
        Math.max(0, Math.trunc(input.minutes)),
        input.appointmentExternalId ?? null,
        input.justificationId ?? null,
        input.label ?? null,
        input.description ?? null,
        input.reason ?? null,
        status,
        debitProtected,
      );
      return current.id;
    }

    const id = newDayEventId();
    await this.prisma.$executeRawUnsafe(
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
    `,
      id,
      input.userId,
      input.dateRef.slice(0, 10),
      input.eventType,
      fromTime,
      toTime,
      Math.max(0, Math.trunc(input.minutes)),
      input.appointmentExternalId ?? null,
      input.justificationId ?? null,
      input.label ?? null,
      input.description ?? null,
      input.reason ?? null,
      status,
      debitProtected,
      sourceKey,
    );
    return id;
  }

  private async syncDayEventsForDays(
    userId: string,
    days: RendimentoDaySummaryDto[],
  ): Promise<void> {
    for (const day of days) {
      if (!day.insights) continue;
      const upserts = collectDayEventUpserts({
        userId,
        dateRef: day.date,
        insights: day.insights,
        entries: day.entries,
      });
      for (const item of upserts) {
        await this.upsertDayEvent(item);
      }
    }
  }

  private async listDayEvents(params: {
    userId: string;
    start: Date;
    end: Date;
  }): Promise<RendimentoDayEventRow[]> {
    await this.ensureRendimentoTables();
    return (
      (await this.prisma.$queryRawUnsafe<RendimentoDayEventRow[]>(
        `
        SELECT
          id,
          user_id,
          date_ref::text AS date_ref,
          event_type,
          to_char(from_time, 'HH24:MI') AS from_time,
          to_char(to_time, 'HH24:MI') AS to_time,
          minutes,
          appointment_external_id,
          justification_id,
          label,
          description,
          reason,
          status,
          debit_protected,
          source_key
        FROM rendimento_day_events
        WHERE user_id = $1
          AND date_ref BETWEEN $2::date AND $3::date
          AND deleted_at IS NULL
        ORDER BY date_ref ASC, from_time ASC NULLS LAST
      `,
        params.userId,
        this.toDateOnlyString(params.start),
        this.toDateOnlyString(params.end),
      )) ?? []
    );
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
        role: { in: [UserRole.ADMIN, UserRole.COLLABORATOR] }, // PJ não tem agenda de rendimento
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
    const days = this.groupByDay(rows, justificationsByDate);
    await this.syncDayEventsForDays(user.id, days);
    const dayEvents = await this.listDayEvents({ userId: user.id, start, end });
    this.attachDayEventsToDays(days, dayEvents);

    const payrollRows = await this.fetchAppointments({
      tifluxUserId: tifluxUser.id,
      start: payrollPeriod.start,
      end: payrollPeriod.end,
    });

    const totalMinutes = computeUnionWorkedMinutes(rows, 'ALL');
    const periodOvertimeMinutes = computeUnionWorkedMinutes(
      payrollRows,
      'EXTRA',
    );
    const periodPlantaoMinutes = computeUnionWorkedMinutes(rows, 'PLANTAO');
    const overtimeBalanceMinutes = await this.refreshOvertimeBalance(
      user.id,
      periodOvertimeMinutes,
      reference,
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
      days,
    };
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
    await this.ensureRendimentoTables();
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
    if (params.gapType === 'lunch' && gapMinutesPreview > LUNCH_MINUTES) {
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
      label: this.gapLabelForType(params.gapType, gapMinutes),
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
    await this.ensureRendimentoTables();
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
    await this.ensureRendimentoTables();
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
}
