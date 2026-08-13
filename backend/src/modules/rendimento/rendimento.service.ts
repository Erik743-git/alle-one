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
import { isClientGestorRole } from '../../common/security/client-portal-role';
import type { RendimentoCalendarView } from './rendimento.dto';
import {
  analyzeRendimentoDay,
  GAP_ALERT_MINUTES,
  isRendimentoDateToday,
  overtimeKindFromValorization,
  type RendimentoDayInsightsDto,
  type RendimentoDaySchedule,
  type RendimentoGapDto,
} from './rendimento-day-insights';
import { getEffectiveRendimentoSchedule } from '../users/user-rendimento-schedule.helper';
import {
  buildDayEventSourceKey,
  collectDayEventUpserts,
  normalizeClockTimeForDb,
  newDayEventId,
  type RendimentoDayEventRow,
  type RendimentoDayEventStatus,
  type UpsertDayEventInput,
} from './rendimento-day-events.helper';
import {
  computeRawAppointmentMinutes,
  computeUnionWorkedMinutes,
} from './rendimento-worked-minutes.helper';
import {
  resolvePayrollPeriodRange,
  resolvePayrollPeriodRangeForCalendarMonth,
} from './rendimento-payroll-period.helper';
import { AuditService } from '../audit/audit.service';
import {
  RendimentoStoreService,
  type GapJustificationRow,
} from './rendimento-store.service';
import { RendimentoOvertimeBalanceService } from './rendimento-overtime-balance.service';
import { isTicketsPortalCanonical } from '../tickets/tickets-portal.config';
import { serviceNameToValorizationRaw } from '../tickets/portal-appointment.helper';
import {
  appointmentDescriptionHasMedia,
  appointmentDescriptionToPlainText,
} from '../tickets/appointment-doc.util';

export type { RendimentoDayInsightsDto, RendimentoGapDto };

export type RendimentoEntryDto = {
  id: number;
  date: string;
  initTime: string | null;
  endTime: string | null;
  minutes: number;
  hoursFormatted: string;
  ticketNumber: number;
  ticketTitle?: string | null;
  clientName: string | null;
  description: string | null;
  /** Há imagem/anexo para abrir no detalhe (evita enviar base64 na listagem). */
  hasMedia?: boolean;
  portalAppointmentId?: string | null;
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

export type RendimentoCollaboratorListPreferenceDto = {
  collaboratorId: string;
  name: string;
  email: string;
  role: UserRole;
  companyName: string | null;
  listed: boolean;
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
  totalRegularMinutes: number;
  totalRegularHoursFormatted: string;
  totalRawMinutes: number;
  totalRawHoursFormatted: string;
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
  ticket_title: string | null;
  client_name: string | null;
  description: string | null;
  minutes: number;
  valorization_raw: unknown | null;
  portal_appointment_id?: string | null;
  attachment_count?: number;
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
    private readonly overtimeBalance: RendimentoOvertimeBalanceService,
  ) {}

  formatMinutes(totalMinutes: number): string {
    const total = Math.max(0, Math.trunc(Number(totalMinutes) || 0));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private formatSignedMinutes(totalMinutes: number): string {
    const total = Math.trunc(Number(totalMinutes) || 0);
    const sign = total < 0 ? '-' : '';
    const abs = Math.abs(total);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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
    const monthStart = new Date(
      reference.getFullYear(),
      reference.getMonth(),
      1,
    );
    const monthEnd = new Date(
      reference.getFullYear(),
      reference.getMonth() + 1,
      0,
    );
    start.setTime(monthStart.getTime());
    start.setDate(start.getDate() - start.getDay());
    end.setTime(monthEnd.getTime());
    end.setDate(end.getDate() + (6 - end.getDay()));
    return { start, end };
  }

  /** Limites do mês civil (só o mês exibido no título), para totais da grade. */
  private resolveCalendarMonthBounds(reference: Date): {
    start: Date;
    end: Date;
  } {
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
      name: String(params.name ?? '').trim() || `Usuário ${id}`,
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
  private async ensureTifluxUserEmailMap(): Promise<
    Map<string, TifluxUserLink>
  > {
    if (this.tifluxUserEmailMap) {
      return this.tifluxUserEmailMap;
    }

    if (this.tifluxUserEmailMapLoadPromise) {
      return this.tifluxUserEmailMapLoadPromise;
    }

    this.tifluxUserEmailMapLoadPromise = (async () => {
      const fromDb = await this.loadTifluxUserEmailMapFromDb();
      if (!this.allowRuntimeTifluxApi) {
        return fromDb;
      }
      try {
        const fromApi = await this.loadTifluxUserEmailMapFromApi();
        for (const [email, link] of fromApi) {
          if (!fromDb.has(email)) {
            fromDb.set(email, link);
          }
        }
      } catch (err) {
        this.logger.warn(
          `Falha ao complementar mapa TiFlux via API: ${err instanceof Error ? err.message : err}`,
        );
      }
      return fromDb;
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
    portalUserId: string;
    tifluxUserId: number | null;
    start: Date;
    end: Date;
  }): Promise<AppointmentRow[]> {
    const startDate = this.toDateOnlyString(params.start);
    const endDate = this.toDateOnlyString(params.end);

    if (isTicketsPortalCanonical()) {
      const portalRows =
        (await this.prisma.$queryRaw<
          Array<{
            appointment_id: number;
            appointment_date: string;
            init_time: string | null;
            end_time: string | null;
            ticket_number: number;
            ticket_title: string | null;
            client_name: string | null;
            description: string | null;
            service_name: string | null;
            minutes: number;
            portal_appointment_id: string;
            attachment_count: number;
          }>
        >`
        select
          coalesce(a.tiflux_appointment_external_id, abs(hashtext(a.id)))::int as appointment_id,
          a.appointment_date::text as appointment_date,
          a.init_time as init_time,
          a.end_time as end_time,
          a.ticket_number,
          nullif(trim(t.title), '') as ticket_title,
          t.client_name,
          a.description,
          a.service_name,
          a.id as portal_appointment_id,
          (
            select count(*)::int
            from portal_ticket_appointment_attachments att
            where att.portal_appointment_id = a.id
          ) as attachment_count,
          coalesce(
            case
              when a.init_time is null or a.end_time is null or trim(a.init_time) = '' or trim(a.end_time) = '' then 0
              when a.end_time::time >= a.init_time::time
                then extract(epoch from (a.end_time::time - a.init_time::time)) / 60
              else extract(epoch from ((a.end_time::time + interval '24 hours') - a.init_time::time)) / 60
            end,
            0
          )::int as minutes
        from portal_ticket_appointments a
        left join portal_tickets t on t.ticket_number = a.ticket_number
        where a.created_by = ${params.portalUserId}
          and a.appointment_date between ${startDate}::date and ${endDate}::date
        order by a.appointment_date asc, a.init_time asc nulls last, a.id asc
      `) ?? [];

      return portalRows.map((row) => ({
        appointment_id: Number(row.appointment_id),
        appointment_date: row.appointment_date,
        init_time: row.init_time,
        end_time: row.end_time,
        ticket_number: Number(row.ticket_number),
        ticket_title: row.ticket_title,
        client_name: row.client_name,
        description: row.description,
        valorization_raw: serviceNameToValorizationRaw(row.service_name),
        minutes: Number(row.minutes) || 0,
        portal_appointment_id: row.portal_appointment_id,
        attachment_count: Number(row.attachment_count) || 0,
      }));
    }

    if (params.tifluxUserId == null) {
      return [];
    }

    const rows =
      (await this.prisma.$queryRaw<AppointmentRow[]>`
      select
        a.external_id as appointment_id,
        a.appointment_date::text as appointment_date,
        a.init_time::text as init_time,
        a.end_time::text as end_time,
        a.ticket_number,
        coalesce(
          nullif(trim(pt.title), ''),
          nullif(trim(tt.title), '')
        ) as ticket_title,
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
      left join portal_tickets pt on pt.ticket_number = a.ticket_number
      left join tiflux.tickets tt on tt.ticket_number = a.ticket_number
      where a.user_external_id = ${params.tifluxUserId}
        and a.appointment_date::date between ${startDate}::date and ${endDate}::date
      order by a.appointment_date asc, a.init_time asc nulls last, a.external_id asc
    `) ?? [];

    return rows;
  }

  private async getOvertimeBalanceMinutes(userId: string): Promise<number> {
    return this.overtimeBalance.getBalanceMinutes(userId);
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
      fromTime: this.normalizeTimeHHMM(row.from_time),
      toTime: this.normalizeTimeHHMM(row.to_time),
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

  private gapLabelForType(type: 'idle' | 'lunch', gapMinutes: number): string {
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

  /** Lacunas que cruzam meia-noite (ex. 20:00→03:00) usam gapMinutes no eixo estendido. */
  private resolveGapSpanMinutes(
    gap: Pick<RendimentoGapDto, 'fromTime' | 'toTime' | 'gapMinutes'>,
  ): { from: number; to: number } {
    const from = this.parseHHMMToMinutes(gap.fromTime);
    const clockTo = this.parseHHMMToMinutes(gap.toTime);
    if (clockTo > from) {
      return { from, to: clockTo };
    }
    const span =
      Number(gap.gapMinutes) > 0
        ? Math.trunc(Number(gap.gapMinutes))
        : clockTo + 24 * 60 - from;
    return { from, to: from + Math.max(span, 0) };
  }

  private overlapsMinutes(
    aFrom: number,
    aTo: number,
    bFrom: number,
    bTo: number,
  ): boolean {
    return Math.max(aFrom, bFrom) < Math.min(aTo, bTo);
  }

  private justificationSuffix(justification?: {
    status: RendimentoJustificationStatus;
  }): string {
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
      return gap.justification ? gap : null;
    }
    return {
      ...gap,
      type: 'idle',
      label: this.gapLabelForType('idle', gap.gapMinutes),
    };
  }

  private filterSubThresholdIdleGaps(
    gaps: RendimentoGapDto[],
  ): RendimentoGapDto[] {
    return gaps.filter(
      (gap) =>
        gap.type !== 'idle' ||
        gap.gapMinutes > GAP_ALERT_MINUTES ||
        gap.justification != null,
    );
  }

  private gapFromJustificationRow(row: GapJustificationRow): RendimentoGapDto {
    const fromTime = this.normalizeTimeHHMM(row.from_time);
    const toTime = this.normalizeTimeHHMM(row.to_time);
    const fromMinutes = this.parseHHMMToMinutes(fromTime);
    const toMinutes = this.parseHHMMToMinutes(toTime);
    const gapMinutes =
      Number(row.gap_minutes) > 0
        ? Number(row.gap_minutes)
        : Math.max(0, toMinutes - fromMinutes);
    const gapType = row.gap_type;
    const justification = this.mapJustificationDto(row);
    const suffix = this.justificationStatusSuffix(row.status);

    return {
      type: gapType,
      fromTime,
      toTime,
      gapMinutes,
      label: `${this.gapLabelForType(gapType, gapMinutes)}${suffix}`,
      justification,
    };
  }

  /** Garante que justificativas salvas no banco não sumam após filtros de lacuna. */
  private recoverMissingJustificationGaps(
    gaps: RendimentoGapDto[],
    alertJustifications: GapJustificationRow[],
  ): RendimentoGapDto[] {
    const visibleIds = new Set(
      gaps
        .map((gap) => gap.justification?.id)
        .filter((id): id is string => Boolean(id)),
    );
    const missing = alertJustifications.filter(
      (row) => !visibleIds.has(row.id),
    );
    if (!missing.length) return gaps;

    const recovered = missing.map((row) => this.gapFromJustificationRow(row));
    return [...gaps, ...recovered].sort((a, b) =>
      a.fromTime.localeCompare(b.fromTime),
    );
  }

  /**
   * Remove trechos já cobertos por justificativa de alerta (pendente ou aprovada)
   * de lacunas idle ainda sem vínculo — evita alerta de 90 min quando 12:00–12:30 já foi justificado.
   */
  private subtractAlertJustificationsFromUnjustifiedIdleGaps(
    gaps: RendimentoGapDto[],
    alertJustifications: GapJustificationRow[],
  ): RendimentoGapDto[] {
    const activeCuts = alertJustifications.filter(
      (row) => row.status === 'PENDING' || row.status === 'APPROVED',
    );
    if (!activeCuts.length) return gaps;

    const result: RendimentoGapDto[] = [];

    for (const gap of gaps) {
      if (gap.type !== 'idle' || gap.justification) {
        result.push(gap);
        continue;
      }

      const { from: gapFrom, to: gapTo } = this.resolveGapSpanMinutes(gap);
      if (gapTo <= gapFrom) continue;

      let segments: Array<{ from: number; to: number }> = [
        { from: gapFrom, to: gapTo },
      ];

      for (const row of activeCuts) {
        const cutSpan = this.resolvePeriodSpanMinutes(
          this.normalizeTimeHHMM(row.from_time),
          this.normalizeTimeHHMM(row.to_time),
        );
        if (!cutSpan) continue;
        const next: Array<{ from: number; to: number }> = [];
        for (const segment of segments) {
          next.push(
            ...this.subtractIntervalFromSegment(
              segment.from,
              segment.to,
              cutSpan.from,
              cutSpan.to,
            ),
          );
        }
        segments = next;
      }

      for (const segment of segments) {
        const gapMinutes = segment.to - segment.from;
        if (gapMinutes <= 0) continue;
        result.push({
          ...gap,
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

  /**
   * Por dia: no máximo um almoço (justificado pelo colaborador tem prioridade)
   * e duração máxima configurada — o excedente vira alerta de lacuna.
   */
  private normalizeLunchGaps(
    gaps: RendimentoGapDto[],
    lunchMinutes: number,
  ): RendimentoGapDto[] {
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
      if (gap.type !== 'lunch' || gap.gapMinutes <= lunchMinutes) {
        expanded.push(gap);
        continue;
      }

      const from = this.parseHHMMToMinutes(gap.fromTime);
      const to = this.parseHHMMToMinutes(gap.toTime);
      if (to <= from) {
        expanded.push(gap);
        continue;
      }

      const lunchEnd = from + lunchMinutes;
      const remainingMinutes = to - lunchEnd;
      const suffix = this.justificationSuffix(gap.justification);

      expanded.push({
        ...gap,
        type: 'lunch',
        fromTime: this.formatMinutesAsTime(from),
        toTime: this.formatMinutesAsTime(lunchEnd),
        gapMinutes: lunchMinutes,
        label: `${this.gapLabelForType('lunch', lunchMinutes)}${suffix}`,
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

  private appointmentOverlapsPeriod(
    initTime: string | null,
    endTime: string | null,
    fromTime: string,
    toTime: string,
  ): boolean {
    if (!initTime?.trim() || !endTime?.trim()) return false;
    const period = this.resolvePeriodSpanMinutes(fromTime, toTime);
    if (!period) return false;
    const apptFrom = this.parseHHMMToMinutes(this.normalizeTimeHHMM(initTime));
    let apptTo = this.parseHHMMToMinutes(this.normalizeTimeHHMM(endTime));
    if (apptTo <= apptFrom) {
      apptTo += 24 * 60;
    }
    return this.overlapsMinutes(period.from, period.to, apptFrom, apptTo);
  }

  private isPeriodContainedInRawGaps(
    rawGaps: RendimentoGapDto[],
    fromTime: string,
    toTime: string,
  ): boolean {
    const period = this.resolvePeriodSpanMinutes(fromTime, toTime);
    if (!period) return false;
    return rawGaps.some((gap) => {
      const gapSpan = this.resolveGapSpanMinutes(gap);
      return period.from >= gapSpan.from && period.to <= gapSpan.to;
    });
  }

  private resolvePeriodSpanMinutes(
    fromTime: string,
    toTime: string,
  ): { from: number; to: number; gapMinutes: number } | null {
    const from = this.parseHHMMToMinutes(this.normalizeTimeHHMM(fromTime));
    let to = this.parseHHMMToMinutes(this.normalizeTimeHHMM(toTime));
    if (to <= from) {
      to += 24 * 60;
    }
    if (to <= from) return null;
    const gapMinutes = to - from;
    if (gapMinutes > 24 * 60) return null;
    return { from, to, gapMinutes };
  }

  private assertValidJustificationPeriod(
    fromTime: string,
    toTime: string,
  ): {
    from: number;
    to: number;
    gapMinutes: number;
  } {
    const span = this.resolvePeriodSpanMinutes(fromTime, toTime);
    if (!span) {
      throw new BadRequestException(
        'Horário inválido. Se o expediente cruza a meia-noite (ex.: 23:00 até 07:00), informe o horário do dia seguinte no campo fim.',
      );
    }
    return span;
  }

  private resolveAlertSpanMinutes(
    alertFrom: string,
    alertTo: string,
    alertGapMinutes?: number,
  ): { from: number; to: number } {
    const from = this.parseHHMMToMinutes(this.normalizeTimeHHMM(alertFrom));
    const clockTo = this.parseHHMMToMinutes(this.normalizeTimeHHMM(alertTo));
    if (clockTo > from) {
      return { from, to: clockTo };
    }
    const span =
      alertGapMinutes && alertGapMinutes > 0
        ? Math.trunc(alertGapMinutes)
        : clockTo + 24 * 60 - from;
    return { from, to: from + span };
  }

  private computeTailGapStartMinutes(
    entries: RendimentoEntryDto[],
    gaps: RendimentoGapDto[],
  ): number | null {
    const regular = entries.filter((entry) => !entry.isOvertime);
    if (!regular.length) return null;

    let lastEnd = 0;
    for (const entry of regular) {
      if (!entry.endTime?.trim()) continue;
      lastEnd = Math.max(
        lastEnd,
        this.parseHHMMToMinutes(this.normalizeTimeHHMM(entry.endTime)),
      );
    }

    const lastLunchEnd = gaps
      .filter((gap) => gap.type === 'lunch')
      .map((gap) => this.resolveGapSpanMinutes(gap).to)
      .sort((a, b) => b - a)[0];

    return Math.max(lastEnd, lastLunchEnd ?? lastEnd);
  }

  /**
   * Justificativa voluntária aprovada conta como jornada (sem ticket) e reduz
   * o alerta virtual de fim de dia ("faltou apontar").
   */
  private applyApprovedVoluntaryCreditToTailGap(
    insights: RendimentoDayInsightsDto,
    entries: RendimentoEntryDto[],
    dayJustifications: GapJustificationRow[],
    schedule: RendimentoDaySchedule,
  ): RendimentoDayInsightsDto {
    const approvedVoluntaryMinutes = dayJustifications
      .filter((j) => j.kind === 'VOLUNTARY' && j.status === 'APPROVED')
      .reduce(
        (sum, row) =>
          sum + Math.max(0, Math.trunc(Number(row.gap_minutes) || 0)),
        0,
      );

    if (!approvedVoluntaryMinutes) return insights;

    const alertJustifications = dayJustifications.filter(
      (j) => j.kind !== 'VOLUNTARY',
    );
    const explainedAlertMinutes = alertJustifications
      .filter((j) => j.status === 'APPROVED' || j.status === 'PENDING')
      .reduce(
        (sum, row) =>
          sum + Math.max(0, Math.trunc(Number(row.gap_minutes) || 0)),
        0,
      );

    const stillNeeded = Math.max(
      0,
      schedule.dailyWorkMinutes -
        insights.regularMinutes -
        approvedVoluntaryMinutes,
    );

    const tailFrom = this.computeTailGapStartMinutes(entries, insights.gaps);
    if (tailFrom == null) return insights;

    const withoutTailVirtual = insights.gaps.filter((gap) => {
      if (gap.type !== 'idle') return true;
      const span = this.resolveGapSpanMinutes(gap);
      if (Math.abs(span.from - tailFrom) > 1) return true;
      const justification = gap.justification;
      if (
        justification &&
        justification.kind !== 'VOLUNTARY' &&
        justification.status === 'PENDING'
      ) {
        return true;
      }
      return false;
    });

    let nextGaps = [...withoutTailVirtual];
    const unjustifiedTailMinutes = Math.max(
      0,
      stillNeeded - explainedAlertMinutes,
    );
    if (unjustifiedTailMinutes > GAP_ALERT_MINUTES) {
      // Os minutos da justificativa voluntária já foram creditados acima
      // (em `stillNeeded`). Aqui é só posicionamento visual: o déficit de
      // jornada começa no fim do último apontamento, mas não pode invadir a
      // janela de uma justificativa voluntária aprovada — senão parece que o
      // alerta ignora a justificativa.
      const approvedVoluntarySpans = dayJustifications
        .filter((j) => j.kind === 'VOLUNTARY' && j.status === 'APPROVED')
        .map((j) =>
          this.resolvePeriodSpanMinutes(
            this.normalizeTimeHHMM(j.from_time),
            this.normalizeTimeHHMM(j.to_time),
          ),
        )
        .filter(
          (span): span is { from: number; to: number; gapMinutes: number } =>
            span != null,
        )
        .sort((a, b) => a.from - b.from);

      let tailTo = tailFrom + unjustifiedTailMinutes;
      for (const span of approvedVoluntarySpans) {
        if (span.from > tailFrom && span.from < tailTo) {
          tailTo = span.from;
        }
      }
      if (tailTo <= tailFrom) {
        tailTo = tailFrom + unjustifiedTailMinutes;
      }

      nextGaps.push({
        type: 'idle',
        fromTime: this.formatMinutesAsTime(tailFrom),
        toTime: this.formatMinutesAsTime(tailTo),
        gapMinutes: unjustifiedTailMinutes,
        label: `Faltam ${unjustifiedTailMinutes} min para fechar a jornada`,
      });
    }

    nextGaps = this.subtractAlertJustificationsFromUnjustifiedIdleGaps(
      nextGaps,
      alertJustifications,
    );
    nextGaps = this.recoverMissingJustificationGaps(
      nextGaps,
      alertJustifications,
    );
    nextGaps.sort((a, b) => a.fromTime.localeCompare(b.fromTime));

    const hasIdleGapAlert = nextGaps.some((gap) => {
      if (gap.type !== 'idle' || gap.gapMinutes <= GAP_ALERT_MINUTES)
        return false;
      const justification = gap.justification;
      if (!justification) return true;
      if (justification.kind === 'VOLUNTARY') return false;
      return justification.status !== 'APPROVED';
    });

    return {
      ...insights,
      gaps: nextGaps,
      hasIdleGapAlert,
    };
  }

  private assertPeriodWithinAlertBounds(
    fromTime: string,
    toTime: string,
    alertFrom?: string,
    alertTo?: string,
    alertGapMinutes?: number,
  ) {
    if (!alertFrom?.trim() || !alertTo?.trim()) return;
    const period = this.resolvePeriodSpanMinutes(fromTime, toTime);
    if (!period) {
      throw new BadRequestException(
        'Horário inválido. Se o expediente cruza a meia-noite (ex.: 23:00 até 07:00), informe o horário do dia seguinte no campo fim.',
      );
    }
    const alertSpan = this.resolveAlertSpanMinutes(
      alertFrom,
      alertTo,
      alertGapMinutes,
    );
    if (period.from < alertSpan.from || period.to > alertSpan.to) {
      throw new BadRequestException(
        'O período deve estar dentro do alerta selecionado.',
      );
    }
  }

  private async assertAlertJustificationPeriodValid(params: {
    userId: string;
    date: string;
    fromTime: string;
    toTime: string;
    alertFromTime?: string;
    alertToTime?: string;
    excludeJustificationId?: string;
    user: {
      email: string;
      rendimentoCustomSchedule?: boolean;
      rendimentoDailyWorkMinutes?: number | null;
      rendimentoLunchMinutes?: number | null;
    };
  }) {
    this.assertPeriodWithinAlertBounds(
      params.fromTime,
      params.toTime,
      params.alertFromTime,
      params.alertToTime,
    );

    const dateOnly = this.toDateOnlyString(this.parseDateOnly(params.date));
    const dayDate = this.parseDateOnly(dateOnly);
    const tifluxUserByEmail = await this.ensureTifluxUserEmailMap();
    const tifluxUser = this.lookupTifluxUser(
      params.user.email,
      tifluxUserByEmail,
    );

    if (tifluxUser != null || isTicketsPortalCanonical()) {
      const rows = await this.fetchAppointments({
        portalUserId: params.userId,
        tifluxUserId: tifluxUser?.id ?? null,
        start: dayDate,
        end: dayDate,
      });
      for (const row of rows) {
        if (
          this.appointmentOverlapsPeriod(
            row.init_time,
            row.end_time,
            params.fromTime,
            params.toTime,
          )
        ) {
          throw new BadRequestException(
            'O período não pode coincidir com horário já registrado em ticket.',
          );
        }
      }

      const schedule = this.toRendimentoDaySchedule(params.user);
      const baseEntries = this.mapEntries(rows);
      const valorizationById = new Map(
        rows.map((row) => [Number(row.appointment_id), row.valorization_raw]),
      );
      const { insights } = analyzeRendimentoDay(
        baseEntries,
        valorizationById,
        schedule,
      );
      if (
        !this.isPeriodContainedInRawGaps(
          insights.gaps,
          params.fromTime,
          params.toTime,
        )
      ) {
        throw new BadRequestException(
          'O período deve estar em um intervalo livre do dia.',
        );
      }
    }

    const justifications = await this.listJustifications({
      userId: params.userId,
      start: dayDate,
      end: dayDate,
    });
    for (const row of justifications) {
      if (
        params.excludeJustificationId &&
        row.id === params.excludeJustificationId
      ) {
        continue;
      }
      const rowSpan = this.resolvePeriodSpanMinutes(
        this.normalizeTimeHHMM(row.from_time),
        this.normalizeTimeHHMM(row.to_time),
      );
      const newSpan = this.resolvePeriodSpanMinutes(
        this.normalizeTimeHHMM(params.fromTime),
        this.normalizeTimeHHMM(params.toTime),
      );
      if (
        rowSpan &&
        newSpan &&
        this.overlapsMinutes(newSpan.from, newSpan.to, rowSpan.from, rowSpan.to)
      ) {
        throw new BadRequestException(
          'O período coincide com outra justificativa já registrada.',
        );
      }
    }
  }

  private splitGapWithAlertJustification(
    gap: RendimentoGapDto,
    matched: GapJustificationRow,
  ): RendimentoGapDto[] {
    const { from: gapFrom, to: gapTo } = this.resolveGapSpanMinutes(gap);
    const justSpan = this.resolvePeriodSpanMinutes(
      this.normalizeTimeHHMM(matched.from_time),
      this.normalizeTimeHHMM(matched.to_time),
    );
    if (!justSpan) return [gap];

    const overlapFrom = Math.max(gapFrom, justSpan.from);
    const overlapTo = Math.min(gapTo, justSpan.to);
    if (overlapTo <= overlapFrom) return [gap];

    const justification = this.mapJustificationDto(matched);
    const suffix = this.justificationStatusSuffix(matched.status);
    const userGapType = matched.gap_type;
    const effectiveType =
      matched.status === 'APPROVED' ? userGapType : gap.type;

    const result: RendimentoGapDto[] = [];

    if (overlapFrom > gapFrom) {
      const minutes = overlapFrom - gapFrom;
      result.push({
        ...gap,
        fromTime: this.formatMinutesAsTime(gapFrom),
        toTime: this.formatMinutesAsTime(overlapFrom),
        gapMinutes: minutes,
        label: this.gapLabelForType(gap.type, minutes),
        justification: undefined,
      });
    }

    const overlapMinutes = overlapTo - overlapFrom;
    result.push({
      ...gap,
      type: effectiveType,
      fromTime: this.formatMinutesAsTime(overlapFrom),
      toTime: this.formatMinutesAsTime(overlapTo),
      gapMinutes: overlapMinutes,
      label: `${this.gapLabelForType(effectiveType, overlapMinutes)}${suffix}`,
      justification,
    });

    if (overlapTo < gapTo) {
      const minutes = gapTo - overlapTo;
      result.push({
        ...gap,
        fromTime: this.formatMinutesAsTime(overlapTo),
        toTime: this.formatMinutesAsTime(gapTo),
        gapMinutes: minutes,
        label: this.gapLabelForType(gap.type, minutes),
        justification: undefined,
      });
    }

    return result;
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

      if (gap.justification && gap.justification.kind !== 'VOLUNTARY') {
        result.push(gap);
        continue;
      }

      const { from, to } = this.resolveGapSpanMinutes(gap);
      if (to <= from) continue;

      let segments: Array<{ from: number; to: number }> = [{ from, to }];
      for (const voluntary of approvedVoluntary) {
        const cutSpan = this.resolvePeriodSpanMinutes(
          this.normalizeTimeHHMM(voluntary.from_time),
          this.normalizeTimeHHMM(voluntary.to_time),
        );
        if (!cutSpan) continue;
        const next: Array<{ from: number; to: number }> = [];
        for (const segment of segments) {
          next.push(
            ...this.subtractIntervalFromSegment(
              segment.from,
              segment.to,
              cutSpan.from,
              cutSpan.to,
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

  private justificationStatusSuffix(
    status: RendimentoJustificationStatus,
  ): string {
    if (status === 'APPROVED') return ' · justificado';
    if (status === 'PENDING') return ' · justificativa pendente';
    return ' · justificativa rejeitada';
  }

  private matchAlertJustificationToGap(
    gap: RendimentoGapDto,
    justifications: GapJustificationRow[],
    usedIds: Set<string>,
  ): GapJustificationRow | undefined {
    const gapSpan = this.resolveGapSpanMinutes(gap);

    return justifications.find((row) => {
      if (usedIds.has(row.id)) return false;
      const justSpan = this.resolvePeriodSpanMinutes(
        this.normalizeTimeHHMM(row.from_time),
        this.normalizeTimeHHMM(row.to_time),
      );
      if (!justSpan) return false;
      if (justSpan.from === gapSpan.from && justSpan.to === gapSpan.to) {
        return true;
      }
      return this.overlapsMinutes(
        gapSpan.from,
        gapSpan.to,
        justSpan.from,
        justSpan.to,
      );
    });
  }

  private applyJustificationsToDay(
    date: string,
    insights: RendimentoDayInsightsDto,
    dayJustifications: GapJustificationRow[],
    lunchMinutes: number,
  ): RendimentoDayInsightsDto {
    const alertJustifications = dayJustifications.filter(
      (j) => j.kind !== 'VOLUNTARY',
    );
    const usedJustificationIds = new Set<string>();

    const gaps = insights.gaps.flatMap((gap) => {
      const matched = this.matchAlertJustificationToGap(
        gap,
        alertJustifications,
        usedJustificationIds,
      );
      if (!matched) return [gap];

      usedJustificationIds.add(matched.id);
      return this.splitGapWithAlertJustification(gap, matched);
    });

    const orphanJustificationGaps: RendimentoGapDto[] = alertJustifications
      .filter((row) => !usedJustificationIds.has(row.id))
      .map((row) => this.gapFromJustificationRow(row));

    const mergedGaps = [...gaps, ...orphanJustificationGaps].sort((a, b) =>
      a.fromTime.localeCompare(b.fromTime),
    );

    const normalizedGaps = this.normalizeLunchGaps(mergedGaps, lunchMinutes);

    const gapsWithoutVoluntaryOverlap =
      this.trimIdleGapsAroundApprovedVoluntary(
        normalizedGaps,
        dayJustifications,
      );

    const visibleGaps = this.recoverMissingJustificationGaps(
      gapsWithoutVoluntaryOverlap,
      alertJustifications,
    );

    const trimmedGaps = this.subtractAlertJustificationsFromUnjustifiedIdleGaps(
      visibleGaps,
      alertJustifications,
    );

    const hasIdleGapAlert = trimmedGaps.some((gap) => {
      if (gap.type !== 'idle' || gap.gapMinutes <= GAP_ALERT_MINUTES)
        return false;
      const justification = gap.justification;
      if (!justification) return true;
      if (justification.kind === 'VOLUNTARY') return false;
      return justification.status !== 'APPROVED';
    });

    return {
      ...insights,
      hasIdleGapAlert,
      hasExpectedLunch: trimmedGaps.some((g) => g.type === 'lunch'),
      gaps: trimmedGaps,
    };
  }

  private mapEntries(rows: AppointmentRow[]): RendimentoEntryDto[] {
    return rows.map((row) => {
      const rawDescription = row.description?.trim() || null;
      const plain = rawDescription
        ? appointmentDescriptionToPlainText(rawDescription).trim() || null
        : null;
      const hasMedia =
        appointmentDescriptionHasMedia(rawDescription) ||
        (Number(row.attachment_count) || 0) > 0;

      return {
        id: Number(row.appointment_id),
        date: row.appointment_date,
        initTime: row.init_time,
        endTime: row.end_time,
        minutes: Number(row.minutes) || 0,
        hoursFormatted: this.formatMinutes(Number(row.minutes) || 0),
        ticketNumber: Number(row.ticket_number),
        ticketTitle: row.ticket_title?.trim() || null,
        clientName: row.client_name,
        description: plain,
        hasMedia,
        portalAppointmentId: row.portal_appointment_id ?? null,
        isOvertime: false,
        overtimeKind: null,
        valorizationServiceName: null,
      };
    });
  }

  private toRendimentoDaySchedule(user: {
    rendimentoCustomSchedule?: boolean;
    rendimentoDailyWorkMinutes?: number | null;
    rendimentoLunchMinutes?: number | null;
  }): RendimentoDaySchedule {
    const effective = getEffectiveRendimentoSchedule(user);
    return {
      dailyWorkMinutes: effective.dailyWorkMinutes,
      lunchMinutes: effective.lunchMinutes,
    };
  }

  private buildDaySummary(
    date: string,
    dayRows: AppointmentRow[],
    justificationsByDate: Map<string, GapJustificationRow[]>,
    schedule: RendimentoDaySchedule,
  ): RendimentoDaySummaryDto {
    const baseEntries = this.mapEntries(dayRows);
    const valorizationById = new Map(
      dayRows.map((row) => [Number(row.appointment_id), row.valorization_raw]),
    );
    const { entries, insights } = analyzeRendimentoDay(
      baseEntries,
      valorizationById,
      schedule,
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
      schedule.lunchMinutes,
    );
    patchedInsights = this.applyApprovedVoluntaryCreditToTailGap(
      patchedInsights,
      entries,
      dayJustifications,
      schedule,
    );
    if (isRendimentoDateToday(dateOnly)) {
      const justifiedGaps = patchedInsights.gaps.filter(
        (gap) => gap.justification != null,
      );
      patchedInsights = this.emptyGapInsights(patchedInsights);
      if (justifiedGaps.length) {
        const gaps = justifiedGaps.sort((a, b) =>
          a.fromTime.localeCompare(b.fromTime),
        );
        patchedInsights = {
          ...patchedInsights,
          gaps,
          hasIdleGapAlert: gaps.some((gap) => {
            if (gap.type !== 'idle' || gap.gapMinutes <= GAP_ALERT_MINUTES) {
              return false;
            }
            const justification = gap.justification;
            if (!justification) return true;
            if (justification.kind === 'VOLUNTARY') return false;
            return justification.status !== 'APPROVED';
          }),
          hasExpectedLunch: gaps.some((g) => g.type === 'lunch'),
        };
      }
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
    schedule: RendimentoDaySchedule,
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
        this.buildDaySummary(date, dayRows, justificationsByDate, schedule),
      );
  }

  private async refreshOvertimeBalance(
    userId: string,
    periodOvertimeMinutes: number,
    referenceDate: Date,
  ): Promise<number> {
    return this.overtimeBalance.refreshBalance(
      userId,
      periodOvertimeMinutes,
      referenceDate,
    );
  }

  private async upsertDayEvent(input: UpsertDayEventInput): Promise<string> {
    const fromTime = normalizeClockTimeForDb(input.fromTime);
    const toTime = normalizeClockTimeForDb(input.toTime);
    const dateRef = input.dateRef.slice(0, 10);
    const sourceKey = buildDayEventSourceKey({
      eventType: input.eventType,
      dateRef: input.dateRef,
      fromTime,
      toTime,
      appointmentExternalId: input.appointmentExternalId,
      justificationId: input.justificationId,
    });
    const isOvertimeEvent =
      input.eventType === 'OVERTIME' || input.eventType === 'PLANTAO';
    const minutes = Math.max(0, Math.trunc(input.minutes));

    type ExistingDayEventRow = {
      id: string;
      status: RendimentoDayEventStatus;
      debit_protected: boolean;
      event_type: string;
    };

    let current: ExistingDayEventRow | undefined;

    if (isOvertimeEvent && input.appointmentExternalId != null) {
      const byAppointment =
        (await this.prisma.$queryRawUnsafe<ExistingDayEventRow[]>(
          `
          SELECT id, status, debit_protected, event_type
          FROM rendimento_day_events
          WHERE user_id = $1
            AND date_ref = $2::date
            AND event_type = $3
            AND appointment_external_id = $4
            AND (
              deleted_at IS NULL
              OR status IN ('APPROVED', 'REJECTED')
            )
          ORDER BY
            deleted_at NULLS FIRST,
            CASE status
              WHEN 'APPROVED' THEN 0
              WHEN 'REJECTED' THEN 1
              WHEN 'PENDING' THEN 2
              ELSE 3
            END,
            updated_at DESC
          LIMIT 1
        `,
          input.userId,
          dateRef,
          input.eventType,
          input.appointmentExternalId,
        )) ?? [];
      current = byAppointment[0];
    }

    if (!current) {
      const existing =
        (await this.prisma.$queryRawUnsafe<ExistingDayEventRow[]>(
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
      current = existing[0];
    }

    if (current && isOvertimeEvent) {
      await this.reconcileOvertimeDayEventSync({
        keepEventId: current.id,
        userId: input.userId,
        dateRef,
        eventType: input.eventType as 'OVERTIME' | 'PLANTAO',
        appointmentExternalId: input.appointmentExternalId ?? null,
        sourceKey,
        fromTime,
        toTime,
        minutes,
        label: input.label ?? null,
        description: input.description ?? null,
        reason: input.reason ?? null,
      });

      if (current.status === 'APPROVED' || current.status === 'REJECTED') {
        await this.prisma.$executeRawUnsafe(
          `
          UPDATE rendimento_day_events
          SET
            from_time = $2::time,
            to_time = $3::time,
            minutes = $4,
            appointment_external_id = $5,
            label = COALESCE($6, label),
            description = COALESCE($7, description),
            reason = COALESCE($8, reason),
            source_key = $9,
            deleted_at = NULL,
            updated_at = NOW()
          WHERE id = $1
        `,
          current.id,
          fromTime,
          toTime,
          minutes,
          input.appointmentExternalId ?? null,
          input.label ?? null,
          input.description ?? null,
          input.reason ?? null,
          sourceKey,
        );
        return current.id;
      }

      const status = input.status ?? current.status ?? 'PENDING';
      const debitProtected =
        input.debitProtected ?? current.debit_protected ?? false;

      await this.prisma.$executeRawUnsafe(
        `
        UPDATE rendimento_day_events
        SET
          from_time = $2::time,
          to_time = $3::time,
          minutes = $4,
          appointment_external_id = $5,
          label = COALESCE($6, label),
          description = COALESCE($7, description),
          reason = COALESCE($8, reason),
          status = $9,
          debit_protected = $10,
          source_key = $11,
          deleted_at = NULL,
          updated_at = NOW()
        WHERE id = $1
      `,
        current.id,
        fromTime,
        toTime,
        minutes,
        input.appointmentExternalId ?? null,
        input.label ?? null,
        input.description ?? null,
        input.reason ?? null,
        status,
        debitProtected,
        sourceKey,
      );

      return current.id;
    }

    const status = input.status ?? current?.status ?? 'ACTIVE';
    const debitProtected =
      input.debitProtected ?? current?.debit_protected ?? false;
    const id = current?.id ?? newDayEventId();

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
        ON CONFLICT (user_id, source_key) WHERE deleted_at IS NULL DO UPDATE SET
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
          AND rendimento_day_events.status IN ('APPROVED', 'REJECTED')
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

  private async reconcileOvertimeDayEventSync(params: {
    keepEventId: string;
    userId: string;
    dateRef: string;
    eventType: 'OVERTIME' | 'PLANTAO';
    appointmentExternalId: number | null;
    sourceKey: string;
    fromTime: string | null;
    toTime: string | null;
    minutes: number;
    label: string | null;
    description: string | null;
    reason: string | null;
  }): Promise<void> {
    if (params.appointmentExternalId != null) {
      await this.prisma.$executeRawUnsafe(
        `
        UPDATE rendimento_day_events
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE user_id = $1
          AND date_ref = $2::date
          AND event_type = $3
          AND appointment_external_id = $4
          AND id <> $5
          AND deleted_at IS NULL
          AND status NOT IN ('APPROVED', 'REJECTED')
      `,
        params.userId,
        params.dateRef,
        params.eventType,
        params.appointmentExternalId,
        params.keepEventId,
      );
    }

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE rendimento_day_events
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE user_id = $1
        AND source_key = $2
        AND id <> $3
        AND deleted_at IS NULL
        AND status NOT IN ('APPROVED', 'REJECTED')
    `,
      params.userId,
      params.sourceKey,
      params.keepEventId,
    );
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
      const dayRef = day.date.slice(0, 10);
      const isToday = isRendimentoDateToday(dayRef);

      if (!isToday) {
        await this.purgeAutoGapEventsForDay(userId, day.date);
      }

      const upserts = collectDayEventUpserts({
        userId,
        dateRef: day.date,
        insights: day.insights,
        entries: day.entries,
      });
      for (const item of upserts) {
        if (
          isToday &&
          (item.eventType === 'IDLE_ALERT' || item.eventType === 'LUNCH')
        ) {
          continue;
        }
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
      throw new BadRequestException(
        'Data inicial não pode ser maior que a final.',
      );
    }

    const collaborators = await this.listCollaboratorsForSelect();
    const targets = params.userId
      ? collaborators.filter((c) => c.id === params.userId)
      : isTicketsPortalCanonical()
        ? collaborators
        : collaborators.filter((c) => c.tifluxUserId != null);

    if (params.userId && targets.length === 0) {
      throw new NotFoundException(
        'Colaborador não encontrado ou sem vínculo externo.',
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
        if (!tifluxUser && !isTicketsPortalCanonical()) continue;

        eventsPurged += await this.purgeAutoGapEventsInRange(
          collaborator.id,
          start,
          end,
        );

        const rows = await this.fetchAppointments({
          portalUserId: collaborator.id,
          tifluxUserId: tifluxUser?.id ?? null,
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

        const userSchedule = await this.prisma.user.findFirst({
          where: { id: collaborator.id },
          select: {
            rendimentoCustomSchedule: true,
            rendimentoDailyWorkMinutes: true,
            rendimentoLunchMinutes: true,
          },
        });
        const schedule = this.toRendimentoDaySchedule(userSchedule ?? {});

        const days = this.groupByDay(rows, justificationsByDate, schedule);
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
          err instanceof Error
            ? err.message
            : 'Erro desconhecido ao reprocessar.';
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

  private dayEventAttachmentKey(
    dateRef: string,
    appointmentId: number,
    eventType: 'OVERTIME' | 'PLANTAO',
  ): string {
    return `${dateRef.slice(0, 10)}|${appointmentId}|${eventType}`;
  }

  private dayEventStatusPriority(status: RendimentoDayEventStatus): number {
    switch (status) {
      case 'APPROVED':
        return 0;
      case 'REJECTED':
        return 1;
      case 'PENDING':
        return 2;
      default:
        return 3;
    }
  }

  private resolveEntryOvertimeEventType(
    entry: RendimentoEntryDto,
  ): 'OVERTIME' | 'PLANTAO' | null {
    if (entry.overtimeKind === 'PLANTAO') return 'PLANTAO';
    if (entry.overtimeKind === 'EXTRA') return 'OVERTIME';
    if (entry.isOvertime) return 'OVERTIME';

    const fromService = overtimeKindFromValorization(
      entry.valorizationServiceName,
    );
    if (fromService === 'PLANTAO') return 'PLANTAO';
    if (fromService === 'EXTRA') return 'OVERTIME';
    return null;
  }

  private findOvertimeDayEventForEntry(
    byKey: Map<string, RendimentoDayEventRow>,
    dayRef: string,
    appointmentId: number,
    preferredType: 'OVERTIME' | 'PLANTAO',
  ): RendimentoDayEventRow | undefined {
    const primary = byKey.get(
      this.dayEventAttachmentKey(dayRef, appointmentId, preferredType),
    );
    if (primary) return primary;

    const alternate = preferredType === 'OVERTIME' ? 'PLANTAO' : 'OVERTIME';
    return byKey.get(
      this.dayEventAttachmentKey(dayRef, appointmentId, alternate),
    );
  }

  private attachDayEventsToDays(
    days: RendimentoDaySummaryDto[],
    events: RendimentoDayEventRow[],
  ): void {
    const byKey = new Map<string, RendimentoDayEventRow>();
    for (const event of events) {
      if (event.appointment_external_id == null) continue;
      if (event.event_type !== 'OVERTIME' && event.event_type !== 'PLANTAO') {
        continue;
      }
      const eventType = event.event_type;
      const key = this.dayEventAttachmentKey(
        event.date_ref,
        Number(event.appointment_external_id),
        eventType,
      );
      const current = byKey.get(key);
      if (
        !current ||
        this.dayEventStatusPriority(event.status) <
          this.dayEventStatusPriority(current.status)
      ) {
        byKey.set(key, event);
      }
    }

    for (const day of days) {
      const dayRef = day.date.slice(0, 10);
      day.entries = day.entries.map((entry) => {
        const eventType = this.resolveEntryOvertimeEventType(entry);
        if (!eventType) return entry;

        const event = this.findOvertimeDayEventForEntry(
          byKey,
          dayRef,
          entry.id,
          eventType,
        );
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
    _start: Date,
    _end: Date,
  ): Promise<number> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { email: true },
    });
    if (!user) return 0;

    const tifluxUserByEmail = await this.ensureTifluxUserEmailMap();
    const tifluxUser = this.lookupTifluxUser(user.email, tifluxUserByEmail);
    if (tifluxUser == null && !isTicketsPortalCanonical()) return 0;

    const payroll = resolvePayrollPeriodRange(new Date());
    const rows = await this.fetchAppointments({
      portalUserId: userId,
      tifluxUserId: tifluxUser?.id ?? null,
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

      if (tifluxUser != null || isTicketsPortalCanonical()) {
        const monthRows = await this.fetchAppointments({
          portalUserId: user.id,
          tifluxUserId: tifluxUser?.id ?? null,
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

  /**
   * Gestor do cliente: lista funcionários (CLIENT_MEMBER) da empresa ativa.
   * Não mistura roster Alle — isso fica em Financeiro.
   */
  async listCompanyEmployees(actor: AuthenticatedRequestUser): Promise<
    Array<{
      id: string;
      name: string;
      email: string;
      role: string;
      clientRole: string;
      status: string;
    }>
  > {
    if (!isClientGestorRole(actor.role) || !actor.companyId) {
      throw new ForbiddenException(
        'Somente o gestor da empresa pode listar funcionários.',
      );
    }

    const companyId = actor.companyId;
    const memberships = await this.prisma.userCompany.findMany({
      where: {
        companyId,
        clientRole: 'CLIENT_MEMBER',
        user: {
          deletedAt: null,
          status: UserStatus.ACTIVE,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
          },
        },
      },
      orderBy: { user: { name: 'asc' } },
    });

    return memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.user.role,
      clientRole: m.clientRole,
      status: m.user.status,
    }));
  }

  async listCollaboratorListPreferences(): Promise<
    RendimentoCollaboratorListPreferenceDto[]
  > {
    const collaborators = await this.listCollaboratorsForSelect();
    const prefs = await this.prisma.rendimentoCollaboratorListPref.findMany({
      select: { collaboratorUserId: true, listed: true },
    });
    const listedByCollaboratorId = new Map(
      prefs.map((pref) => [pref.collaboratorUserId, pref.listed]),
    );

    return collaborators.map((collaborator) => ({
      collaboratorId: collaborator.id,
      name: collaborator.name,
      email: collaborator.email,
      role: collaborator.role,
      companyName: collaborator.companyName,
      listed: listedByCollaboratorId.get(collaborator.id) ?? true,
    }));
  }

  async setCollaboratorListPreference(params: {
    collaboratorUserId: string;
    listed: boolean;
  }): Promise<{ collaboratorId: string; listed: boolean }> {
    const collaborator = await this.prisma.user.findFirst({
      where: {
        id: params.collaboratorUserId,
        deletedAt: null,
        status: UserStatus.ACTIVE,
        role: { in: [UserRole.ADMIN, UserRole.COLLABORATOR] },
      },
      select: { id: true },
    });

    if (!collaborator) {
      throw new NotFoundException('Colaborador não encontrado.');
    }

    await this.prisma.rendimentoCollaboratorListPref.upsert({
      where: { collaboratorUserId: params.collaboratorUserId },
      create: {
        collaboratorUserId: params.collaboratorUserId,
        listed: params.listed,
      },
      update: { listed: params.listed },
    });

    return {
      collaboratorId: params.collaboratorUserId,
      listed: params.listed,
    };
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

    if (tifluxUser == null && !isTicketsPortalCanonical()) {
      const overtimeBalanceMinutes = await this.getOvertimeBalanceMinutes(
        user.id,
      );
      return {
        userId: user.id,
        userName: user.name,
        view: params.view,
        referenceDate: this.toDateOnlyString(reference),
        rangeStart: this.toDateOnlyString(start),
        rangeEnd: this.toDateOnlyString(end),
        totalMinutes: 0,
        totalHoursFormatted: this.formatMinutes(0),
        totalRegularMinutes: 0,
        totalRegularHoursFormatted: this.formatMinutes(0),
        totalRawMinutes: 0,
        totalRawHoursFormatted: this.formatMinutes(0),
        periodOvertimeMinutes: 0,
        periodOvertimeFormatted: this.formatMinutes(0),
        periodOvertimeRangeLabel:
          resolvePayrollPeriodRangeForCalendarMonth(reference).label,
        periodPlantaoMinutes: 0,
        periodPlantaoFormatted: this.formatMinutes(0),
        overtimeBalanceMinutes,
        overtimeBalanceFormatted: this.formatSignedMinutes(
          overtimeBalanceMinutes,
        ),
        days: [],
      };
    }

    const payrollPeriod = resolvePayrollPeriodRangeForCalendarMonth(reference);

    const rows = await this.fetchAppointments({
      portalUserId: user.id,
      tifluxUserId: tifluxUser?.id ?? null,
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
    let days = this.groupByDay(
      rows,
      justificationsByDate,
      this.toRendimentoDaySchedule(user),
    );
    if (params.view === 'day') {
      const refKey = this.toDateOnlyString(reference);
      if (!days.some((d) => d.date.slice(0, 10) === refKey)) {
        days = [
          this.buildDaySummary(
            refKey,
            [],
            justificationsByDate,
            this.toRendimentoDaySchedule(user),
          ),
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
      portalUserId: user.id,
      tifluxUserId: tifluxUser?.id ?? null,
      start: payrollPeriod.start,
      end: payrollPeriod.end,
    });

    let scopedRows = rows;
    if (params.view === 'month') {
      const cal = this.resolveCalendarMonthBounds(reference);
      const calStart = this.toDateOnlyString(cal.start);
      const calEnd = this.toDateOnlyString(cal.end);
      scopedRows = rows.filter((row) => {
        const day = String(row.appointment_date).slice(0, 10);
        return day >= calStart && day <= calEnd;
      });
    }
    const totalMinutes = computeUnionWorkedMinutes(scopedRows, 'ALL');
    const totalRawMinutes = computeRawAppointmentMinutes(scopedRows, 'ALL');
    const totalRegularMinutes = computeUnionWorkedMinutes(scopedRows, 'NORMAL');

    const periodOvertimeMinutes = computeUnionWorkedMinutes(
      payrollRows,
      'EXTRA',
    );
    const periodPlantaoMinutes = computeRawAppointmentMinutes(
      payrollRows,
      'PLANTAO',
    );
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
      totalRegularMinutes,
      totalRegularHoursFormatted: this.formatMinutes(totalRegularMinutes),
      totalRawMinutes,
      totalRawHoursFormatted: this.formatMinutes(totalRawMinutes),
      periodOvertimeMinutes,
      periodOvertimeFormatted: this.formatMinutes(periodOvertimeMinutes),
      periodOvertimeRangeLabel: payrollPeriod.label,
      periodPlantaoMinutes,
      periodPlantaoFormatted: this.formatMinutes(periodPlantaoMinutes),
      overtimeBalanceMinutes,
      overtimeBalanceFormatted: this.formatSignedMinutes(
        overtimeBalanceMinutes,
      ),
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
    alertFromTime?: string;
    alertToTime?: string;
  }) {
    this.assertCanManageTargetUser(params.actor, params.userId);

    const user = await this.prisma.user.findFirst({
      where: { id: params.userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        rendimentoCustomSchedule: true,
        rendimentoDailyWorkMinutes: true,
        rendimentoLunchMinutes: true,
      },
    });
    if (!user) {
      throw new NotFoundException('Colaborador não encontrado.');
    }

    const lunchLimitMinutes = getEffectiveRendimentoSchedule(user).lunchMinutes;

    const date = this.toDateOnlyString(this.parseDateOnly(params.date));
    const fromTime = this.normalizeTimeHHMM(params.fromTime);
    const toTime = this.normalizeTimeHHMM(params.toTime);
    const periodSpan = this.assertValidJustificationPeriod(fromTime, toTime);

    const reason = String(params.reason || '').trim();
    if (!reason && params.kind === 'VOLUNTARY') {
      throw new BadRequestException('Justificativa é obrigatória.');
    }

    const gapMinutesPreview =
      Number(params.gapMinutes) > 0
        ? Math.trunc(Number(params.gapMinutes))
        : periodSpan.gapMinutes;
    if (
      params.kind !== 'VOLUNTARY' &&
      params.gapType === 'lunch' &&
      gapMinutesPreview > lunchLimitMinutes
    ) {
      const lunchHours = Math.floor(lunchLimitMinutes / 60);
      const lunchMins = lunchLimitMinutes % 60;
      const lunchLabel =
        lunchMins === 0
          ? `${lunchHours}h`
          : `${lunchHours}h${String(lunchMins).padStart(2, '0')}`;
      throw new BadRequestException(
        `Período de almoço não pode exceder ${lunchLabel}.`,
      );
    }

    if (params.kind === 'ALERT') {
      await this.assertAlertJustificationPeriodValid({
        userId: params.userId,
        date,
        fromTime,
        toTime,
        alertFromTime: params.alertFromTime,
        alertToTime: params.alertToTime,
        user,
      });
    }

    const gapMinutes =
      Number(params.gapMinutes) > 0
        ? Math.trunc(Number(params.gapMinutes))
        : periodSpan.gapMinutes;
    const debitOvertime =
      params.kind === 'ALERT' && !reason ? true : Boolean(params.debitOvertime);
    const overtimeMinutes = debitOvertime
      ? Math.max(0, Math.trunc(Number(params.overtimeMinutes) || gapMinutes))
      : 0;

    const id = randomUUID();
    try {
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
    } catch (err) {
      await this.prisma
        .$executeRawUnsafe(
          `DELETE FROM rendimento_gap_justifications WHERE id = $1`,
          id,
        )
        .catch(() => undefined);
      throw err;
    }

    return { id, status: 'PENDING' as const };
  }

  async updateGapJustification(params: {
    actor: AuthenticatedRequestUser;
    justificationId: string;
    date?: string;
    fromTime?: string;
    toTime?: string;
    reason: string;
    alertFromTime?: string;
    alertToTime?: string;
    debitOvertime?: boolean;
  }) {
    const rows =
      (await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          user_id: string;
          date_ref: string;
          from_time: string;
          to_time: string;
          gap_type: 'idle' | 'lunch';
          gap_minutes: number;
          kind: RendimentoJustificationKind;
          status: RendimentoJustificationStatus;
        }>
      >(
        `
        SELECT
          id,
          user_id,
          date_ref::text AS date_ref,
          to_char(from_time, 'HH24:MI') AS from_time,
          to_char(to_time, 'HH24:MI') AS to_time,
          gap_type,
          gap_minutes,
          kind,
          status
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

    this.assertCanManageTargetUser(params.actor, current.user_id);

    if (current.status !== 'PENDING') {
      throw new BadRequestException(
        'Somente justificativas pendentes podem ser editadas.',
      );
    }

    const reason = String(params.reason || '').trim();
    if (!reason && current.kind === 'VOLUNTARY') {
      throw new BadRequestException('Justificativa é obrigatória.');
    }

    const isVoluntary = current.kind === 'VOLUNTARY';
    const date = isVoluntary
      ? this.toDateOnlyString(
          this.parseDateOnly(params.date ?? current.date_ref),
        )
      : current.date_ref.slice(0, 10);
    const fromTime = isVoluntary
      ? this.normalizeTimeHHMM(params.fromTime ?? current.from_time)
      : this.normalizeTimeHHMM(params.fromTime ?? current.from_time);
    const toTime = isVoluntary
      ? this.normalizeTimeHHMM(params.toTime ?? current.to_time)
      : this.normalizeTimeHHMM(params.toTime ?? current.to_time);

    const periodSpan = this.assertValidJustificationPeriod(fromTime, toTime);

    if (!isVoluntary) {
      const user = await this.prisma.user.findFirst({
        where: { id: current.user_id, deletedAt: null },
        select: {
          email: true,
          rendimentoCustomSchedule: true,
          rendimentoDailyWorkMinutes: true,
          rendimentoLunchMinutes: true,
        },
      });
      if (!user) {
        throw new NotFoundException('Colaborador não encontrado.');
      }
      await this.assertAlertJustificationPeriodValid({
        userId: current.user_id,
        date,
        fromTime,
        toTime,
        alertFromTime: params.alertFromTime,
        alertToTime: params.alertToTime,
        excludeJustificationId: params.justificationId,
        user,
      });
    }

    const gapMinutes = periodSpan.gapMinutes;
    const debitOvertime =
      current.kind === 'ALERT' && !reason
        ? true
        : Boolean(params.debitOvertime);
    const overtimeMinutes = debitOvertime ? gapMinutes : 0;

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE rendimento_gap_justifications
      SET
        date_ref = $2::date,
        from_time = $3::time,
        to_time = $4::time,
        gap_minutes = $5,
        reason = $6,
        debit_overtime = $7,
        overtime_minutes = $8
      WHERE id = $1
    `,
      params.justificationId,
      date,
      fromTime,
      toTime,
      gapMinutes,
      reason,
      debitOvertime,
      overtimeMinutes,
    );

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE rendimento_day_events
      SET
        date_ref = $2::date,
        from_time = $3::time,
        to_time = $4::time,
        minutes = $5,
        reason = $6,
        updated_at = NOW()
      WHERE justification_id = $1
        AND event_type = 'JUSTIFICATION'
        AND deleted_at IS NULL
    `,
      params.justificationId,
      date,
      fromTime,
      toTime,
      gapMinutes,
      reason,
    );

    return { id: params.justificationId, status: 'PENDING' as const };
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
          date_ref: string;
          appointment_external_id: number | null;
          source_key: string;
        }>
      >(
        `
        SELECT
          id,
          user_id,
          event_type,
          status,
          date_ref::text AS date_ref,
          appointment_external_id,
          source_key
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

    if (current.appointment_external_id != null) {
      await this.reconcileOvertimeDayEventSync({
        keepEventId: params.eventId,
        userId: current.user_id,
        dateRef: current.date_ref.slice(0, 10),
        eventType: current.event_type,
        appointmentExternalId: Number(current.appointment_external_id),
        sourceKey: current.source_key,
        fromTime: null,
        toTime: null,
        minutes: 0,
        label: null,
        description: null,
        reason: null,
      });
    }

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

  async deleteGapJustification(params: {
    actor: AuthenticatedRequestUser;
    justificationId: string;
  }) {
    const rows =
      (await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          user_id: string;
          status: RendimentoJustificationStatus;
          kind: RendimentoJustificationKind;
        }>
      >(
        `
        SELECT id, user_id, status, kind
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

    const isAdmin = params.actor.role === 'ADMIN';
    const isOwner = current.user_id === params.actor.userId;
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException(
        'Sem permissão para excluir esta justificativa.',
      );
    }
    if (!isAdmin && current.kind !== 'VOLUNTARY') {
      throw new ForbiddenException(
        'Somente justificativas voluntárias podem ser excluídas pelo colaborador.',
      );
    }

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE rendimento_gap_justifications
      SET deleted_at = NOW()
      WHERE id = $1
    `,
      params.justificationId,
    );

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE rendimento_day_events
      SET deleted_at = NOW(),
          updated_at = NOW()
      WHERE justification_id = $1
        AND event_type = 'JUSTIFICATION'
        AND deleted_at IS NULL
    `,
      params.justificationId,
    );

    await this.audit.log({
      actor: params.actor,
      action: 'DELETE_JUSTIFICATION',
      entity: 'RendimentoGapJustification',
      entityId: params.justificationId,
      payload: { before: current },
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

    return { id: params.justificationId, deleted: true as const };
  }

  private async syncDayEventsForApprovalRange(params: {
    start: string;
    end: string;
    userId?: string | null;
  }): Promise<void> {
    const start = this.parseDateOnly(params.start);
    const end = this.parseDateOnly(params.end);
    const collaborators = await this.listCollaboratorsForSelect();
    const targets = params.userId
      ? collaborators.filter((c) => c.id === params.userId)
      : isTicketsPortalCanonical()
        ? collaborators
        : collaborators.filter((c) => c.tifluxUserId != null);

    const tifluxUserByEmail = await this.ensureTifluxUserEmailMap();

    for (const collaborator of targets) {
      try {
        const tifluxUser = this.lookupTifluxUser(
          collaborator.email,
          tifluxUserByEmail,
        );
        if (!tifluxUser && !isTicketsPortalCanonical()) continue;

        const user = await this.prisma.user.findFirst({
          where: { id: collaborator.id, deletedAt: null },
          select: {
            rendimentoCustomSchedule: true,
            rendimentoDailyWorkMinutes: true,
            rendimentoLunchMinutes: true,
          },
        });
        if (!user) continue;

        const rows = await this.fetchAppointments({
          portalUserId: collaborator.id,
          tifluxUserId: tifluxUser?.id ?? null,
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

        const days = this.groupByDay(
          rows,
          justificationsByDate,
          this.toRendimentoDaySchedule(user),
        );
        await this.syncDayEventsForDays(collaborator.id, days);
      } catch (err) {
        this.logger.warn(
          `Falha ao sincronizar eventos para aprovação (${collaborator.email}): ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }
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

      const debitOvertime = Boolean(row.debit_overtime);
      const overtimeMinutes = Number(row.overtime_minutes) || 0;

      return {
        id: row.id,
        userId: row.user_id,
        userEmail: row.user_email,
        date: row.date_ref.slice(0, 10),
        fromTime: row.from_time?.slice(0, 5) ?? null,
        toTime: row.to_time?.slice(0, 5) ?? null,
        gapType,
        gapTypeLabel:
          gapType === 'lunch' ? 'Almoço' : 'Intervalo sem apontamento',
        gapMinutes,
        gapLabel: this.gapLabelForType(gapType, gapMinutes),
        kind,
        kindLabel: kind === 'VOLUNTARY' ? 'Voluntária' : 'Alerta',
        reason: row.reason?.trim() || '',
        debitOvertime,
        /** Abate saldo de horas extras ao aprovar (mesmo valor de debitOvertime). */
        adjustsOvertimeBalance: debitOvertime,
        adjustsOvertimeBalanceLabel: debitOvertime ? 'Sim' : 'Não',
        overtimeMinutes,
        overtimeFormatted: this.formatMinutes(overtimeMinutes),
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
    const uniqueIds = [
      ...new Set(params.ids.map((id) => id.trim()).filter(Boolean)),
    ];
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
          err instanceof Error
            ? err.message
            : 'Falha ao decidir justificativa.';
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

    await this.syncDayEventsForApprovalRange({ start, end, userId });

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
          COALESCE(pa.ticket_number, ta.ticket_number) AS ticket_number,
          COALESCE(co_ticket.name, ptk.client_name, ta.client_name, co_user.name) AS company_name,
          e.status,
          approver.name AS approved_by_name,
          e.approved_at::text AS approved_at
        FROM rendimento_day_events e
        INNER JOIN users u ON u.id = e.user_id AND u.deleted_at IS NULL
        LEFT JOIN companies co_user ON co_user.id = u.company_id
        LEFT JOIN users approver ON approver.id = e.approved_by
        LEFT JOIN portal_ticket_appointments pa
          ON pa.tiflux_appointment_external_id = e.appointment_external_id
        LEFT JOIN portal_tickets ptk ON ptk.ticket_number = pa.ticket_number
        LEFT JOIN tiflux.ticket_appointments ta
          ON ta.external_id = e.appointment_external_id
        LEFT JOIN tiflux.tickets tk ON tk.ticket_number = ta.ticket_number
        LEFT JOIN companies co_ticket
          ON co_ticket.tiflux_client_id = COALESCE(
            ptk.client_external_id,
            tk.client_external_id,
            ta.client_external_id
          )
        WHERE e.deleted_at IS NULL
          AND e.event_type IN ('OVERTIME', 'PLANTAO')
          AND e.date_ref >= $1::date
          AND e.date_ref <= $2::date
          AND ($3::text IS NULL OR e.user_id = $3::text)
          AND e.status = ANY($4::text[])
          AND NOT (
            e.status = 'PENDING'
            AND e.appointment_external_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM rendimento_day_events decided
              WHERE decided.user_id = e.user_id
                AND decided.date_ref = e.date_ref
                AND decided.event_type = e.event_type
                AND decided.appointment_external_id = e.appointment_external_id
                AND decided.status IN ('APPROVED', 'REJECTED')
                AND decided.id <> e.id
            )
          )
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
      const rawDescription =
        row.description?.trim() || row.label?.trim() || null;

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
    const uniqueIds = [
      ...new Set(params.ids.map((id) => id.trim()).filter(Boolean)),
    ];
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
