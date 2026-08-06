import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RendimentoAppointmentQuestionStatus } from '@prisma/client';
import { isClientPortalRole } from '../../common/security/client-portal-role';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { summarizeCompanyAppointmentDescription } from './company-description.util';
import { RendimentoMailService } from './rendimento-mail.service';
import { isTicketsPortalCanonical } from '../tickets/tickets-portal.config';

export type CompanySummaryDto = {
  id: string;
  name: string;
  tifluxClientId: number | null;
  tifluxClientName: string | null;
};

export type CompanyListItemDto = CompanySummaryDto & {
  monthTotalMinutes: number;
  monthTotalHoursFormatted: string;
  pendingQuestionsCount: number;
};

export type CompanyQuestionListItemDto = {
  id: string;
  appointmentSource: 'tiflux' | 'portal';
  appointmentRef: string;
  ticketNumber: number;
  appointmentDate: string;
  initTime: string | null;
  endTime: string | null;
  userName: string | null;
  description: string | null;
  message: string;
  questionedByName: string;
  createdAt: string;
  status: 'PENDING' | 'ANSWERED';
  adminResponse: string | null;
  abonado: boolean;
  respondedAt: string | null;
};

export type CompanyAppointmentEntryDto = {
  source: 'tiflux' | 'portal';
  ref: string;
  ticketNumber: number;
  date: string;
  initTime: string | null;
  endTime: string | null;
  minutes: number;
  hoursFormatted: string;
  userName: string | null;
  description: string | null;
  descriptionFull: string | null;
  descriptionTruncated: boolean;
  serviceName: string | null;
  question: {
    id: string;
    status: 'PENDING' | 'ANSWERED';
    message: string;
    adminResponse: string | null;
    adminResponseCode: string | null;
    abonado: boolean;
    createdAt: string;
    respondedAt: string | null;
  } | null;
};

export type CompanyAgendaDayDto = {
  date: string;
  totalMinutes: number;
  totalHoursFormatted: string;
  appointmentCount: number;
  pendingQuestions: number;
  entries: CompanyAppointmentEntryDto[];
};

export type CompanyAgendaDto = {
  company: CompanySummaryDto;
  date: string;
  view: 'month' | 'week' | 'day';
  rangeStart: string;
  rangeEnd: string;
  totalMinutes: number;
  totalHoursFormatted: string;
  totalAppointments: number;
  totalPendingQuestions: number;
  days: CompanyAgendaDayDto[];
};

@Injectable()
export class RendimentoCompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: RendimentoMailService,
  ) {}

  private formatDateOnly(value: Date | null): string | null {
    if (!value) return null;
    const y = value.getUTCFullYear();
    const mo = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }

  private formatTime(value: Date | null): string | null {
    if (!value) return null;
    return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
  }

  private minutesFromTimes(init: string | null, end: string | null): number {
    const parse = (v: string | null) => {
      if (!v) return null;
      const [h, m] = v.split(':').map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      return h * 60 + m;
    };
    const a = parse(init);
    const b = parse(end);
    if (a == null || b == null) return 0;
    return Math.max(0, b - a);
  }

  private formatMinutes(totalMinutes: number): string {
    const total = Math.max(0, Math.trunc(Number(totalMinutes) || 0));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private monthRange(dateIso: string) {
    const [y, mo] = dateIso.split('-').map(Number);
    const start = new Date(Date.UTC(y, mo - 1, 1));
    const end = new Date(Date.UTC(y, mo, 0));
    return {
      start: this.formatDateOnly(start)!,
      end: this.formatDateOnly(end)!,
    };
  }

  private weekRange(dateIso: string) {
    const [y, mo, d] = dateIso.split('-').map(Number);
    const ref = new Date(Date.UTC(y, mo - 1, d));
    const dow = ref.getUTCDay();
    const start = new Date(ref);
    start.setUTCDate(ref.getUTCDate() - dow);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return {
      start: this.formatDateOnly(start)!,
      end: this.formatDateOnly(end)!,
    };
  }

  private mapDescription(raw: string | null) {
    const parsed = summarizeCompanyAppointmentDescription(raw);
    return {
      description: parsed.summary,
      descriptionFull: parsed.truncated ? parsed.full : parsed.summary,
      descriptionTruncated: parsed.truncated,
    };
  }

  private async assertCompanyAccess(
    actor: AuthenticatedRequestUser,
    companyId: string,
  ) {
    if (actor.role === 'ADMIN') return;
    if (isClientPortalRole(actor.role) && actor.companyId === companyId) return;
    throw new ForbiddenException('Sem permissão para esta empresa.');
  }

  private async getCompanyOrThrow(companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
    });
    if (!company) {
      throw new NotFoundException('Empresa não encontrada.');
    }
    return company;
  }

  private currentMonthRange() {
    const now = new Date();
    const y = now.getUTCFullYear();
    const mo = now.getUTCMonth();
    const start = new Date(Date.UTC(y, mo, 1));
    const end = new Date(Date.UTC(y, mo + 1, 0));
    return {
      start: this.formatDateOnly(start)!,
      end: this.formatDateOnly(end)!,
    };
  }

  private async computeCompanyMonthMinutes(
    clientId: number,
    range: { start: string; end: string },
  ): Promise<number> {
    if (isTicketsPortalCanonical()) {
      const portalRows =
        (await this.prisma.$queryRaw<
          Array<{ init_time: string | null; end_time: string | null }>
        >`
          SELECT a.init_time, a.end_time
          FROM portal_ticket_appointments a
          INNER JOIN portal_tickets t ON t.ticket_number = a.ticket_number
          WHERE t.client_external_id = ${clientId}
            AND a.appointment_date >= ${range.start}::date
            AND a.appointment_date <= ${range.end}::date
        `) ?? [];
      let total = 0;
      for (const row of portalRows) {
        total += this.minutesFromTimes(row.init_time, row.end_time);
      }
      return total;
    }

    const tifluxRows =
      (await this.prisma.$queryRaw<
        Array<{ init_time: Date | null; end_time: Date | null }>
      >`
        SELECT a.init_time, a.end_time
        FROM tiflux.ticket_appointments a
        INNER JOIN tiflux.tickets t ON t.ticket_number = a.ticket_number
        WHERE t.client_external_id = ${clientId}
          AND a.appointment_date >= ${range.start}::date
          AND a.appointment_date <= ${range.end}::date
      `) ?? [];

    let total = 0;
    for (const row of tifluxRows) {
      total += this.minutesFromTimes(
        this.formatTime(row.init_time),
        this.formatTime(row.end_time),
      );
    }

    const portalRows = await this.prisma.portalTicketAppointment.findMany({
      where: {
        appointmentDate: {
          gte: new Date(`${range.start}T12:00:00.000Z`),
          lte: new Date(`${range.end}T12:00:00.000Z`),
        },
        syncStatus: { in: ['PORTAL_ONLY', 'PENDING_TIFLUX', 'SYNCED'] },
        tifluxAppointmentExternalId: null,
      },
      select: { ticketNumber: true, initTime: true, endTime: true },
    });

    if (portalRows.length > 0) {
      const ticketNumbers = [...new Set(portalRows.map((r) => r.ticketNumber))];
      const portalTickets =
        ticketNumbers.length > 0
          ? await this.prisma.portalTicket.findMany({
              where: { ticketNumber: { in: ticketNumbers } },
              select: { ticketNumber: true, clientExternalId: true },
            })
          : [];
      const ticketClientMap = new Map(
        portalTickets.map((t) => [t.ticketNumber, t.clientExternalId]),
      );
      for (const row of portalRows) {
        if (ticketClientMap.get(row.ticketNumber) !== clientId) continue;
        total += this.minutesFromTimes(row.initTime, row.endTime);
      }
    }

    return total;
  }

  private mapCompanyListItem(
    company: {
      id: string;
      name: string;
      tifluxClientId: number | null;
      tifluxClientName: string | null;
    },
    monthMinutes: number,
    pendingQuestionsCount: number,
  ): CompanyListItemDto {
    return {
      id: company.id,
      name: company.name,
      tifluxClientId: company.tifluxClientId,
      tifluxClientName: company.tifluxClientName,
      monthTotalMinutes: monthMinutes,
      monthTotalHoursFormatted: this.formatMinutes(monthMinutes),
      pendingQuestionsCount,
    };
  }

  async listCompanies(
    actor: AuthenticatedRequestUser,
  ): Promise<CompanyListItemDto[]> {
    const monthRange = this.currentMonthRange();

    if (isClientPortalRole(actor.role)) {
      if (!actor.companyId) return [];
      const company = await this.getCompanyOrThrow(actor.companyId);
      const monthMinutes = company.tifluxClientId
        ? await this.computeCompanyMonthMinutes(
            company.tifluxClientId,
            monthRange,
          )
        : 0;
      const pendingQuestionsCount =
        await this.prisma.rendimentoAppointmentQuestion.count({
          where: {
            companyId: company.id,
            status: RendimentoAppointmentQuestionStatus.PENDING,
          },
        });
      return [
        this.mapCompanyListItem(company, monthMinutes, pendingQuestionsCount),
      ];
    }

    if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Acesso restrito.');
    }

    const rows = await this.prisma.company.findMany({
      where: { deletedAt: null, tifluxClientId: { not: null } },
      orderBy: { name: 'asc' },
    });

    const companyIds = rows.map((c) => c.id);
    const pendingByCompany =
      companyIds.length > 0
        ? await this.prisma.rendimentoAppointmentQuestion.groupBy({
            by: ['companyId'],
            where: {
              companyId: { in: companyIds },
              status: RendimentoAppointmentQuestionStatus.PENDING,
            },
            _count: { _all: true },
          })
        : [];
    const pendingMap = new Map(
      pendingByCompany.map((row) => [row.companyId, row._count._all]),
    );

    const result: CompanyListItemDto[] = [];
    for (const company of rows) {
      const monthMinutes = company.tifluxClientId
        ? await this.computeCompanyMonthMinutes(
            company.tifluxClientId,
            monthRange,
          )
        : 0;
      result.push(
        this.mapCompanyListItem(
          company,
          monthMinutes,
          pendingMap.get(company.id) ?? 0,
        ),
      );
    }

    return result;
  }

  async listCompanyQuestions(params: {
    actor: AuthenticatedRequestUser;
    companyId: string;
    status?: 'PENDING' | 'ANSWERED';
  }): Promise<CompanyQuestionListItemDto[]> {
    if (params.actor.role !== 'ADMIN') {
      throw new ForbiddenException('Acesso restrito.');
    }
    await this.getCompanyOrThrow(params.companyId);

    const rows = await this.prisma.rendimentoAppointmentQuestion.findMany({
      where: {
        companyId: params.companyId,
        ...(params.status
          ? { status: params.status as RendimentoAppointmentQuestionStatus }
          : {}),
      },
      include: {
        questioner: { select: { name: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    return rows.map((row) => {
      const desc = this.mapDescription(row.description);
      return {
        id: row.id,
        appointmentSource: row.appointmentSource as 'tiflux' | 'portal',
        appointmentRef: row.appointmentRef,
        ticketNumber: row.ticketNumber,
        appointmentDate: this.formatDateOnly(row.appointmentDate) ?? '',
        initTime: row.initTime,
        endTime: row.endTime,
        userName: row.userName,
        description: desc.description,
        message: row.message,
        questionedByName: row.questioner.name,
        createdAt: row.createdAt.toISOString(),
        status: row.status,
        adminResponse: row.adminResponse,
        abonado: row.abonado,
        respondedAt: row.respondedAt?.toISOString() ?? null,
      };
    });
  }

  async getCompanyAgenda(params: {
    actor: AuthenticatedRequestUser;
    companyId: string;
    view: 'month' | 'week' | 'day';
    date?: string;
  }): Promise<CompanyAgendaDto> {
    await this.assertCompanyAccess(params.actor, params.companyId);
    const company = await this.getCompanyOrThrow(params.companyId);

    if (!company.tifluxClientId) {
      throw new BadRequestException(
        'Empresa sem cliente TiFlux vinculado. Configure tiflux_client_id.',
      );
    }

    const refDate =
      params.date?.trim() || new Date().toISOString().slice(0, 10);
    const range =
      params.view === 'day'
        ? { start: refDate, end: refDate }
        : params.view === 'week'
          ? this.weekRange(refDate)
          : this.monthRange(refDate);

    const clientId = company.tifluxClientId;

    const valorLabel = (raw: unknown): string | null => {
      if (!raw || typeof raw !== 'object') return null;
      const v = raw as Record<string, unknown>;
      const loose = (v.loose_service as { name?: string } | undefined)?.name;
      const contract = (v.contract as { name?: string } | undefined)?.name;
      const name = typeof v.name === 'string' ? v.name : null;
      return loose?.trim() || contract?.trim() || name?.trim() || null;
    };

    const entries: CompanyAppointmentEntryDto[] = [];

    if (isTicketsPortalCanonical()) {
      const portalOnly =
        (await this.prisma.$queryRaw<
          Array<{
            id: string;
            ticket_number: number;
            appointment_date: Date;
            init_time: string | null;
            end_time: string | null;
            user_name: string | null;
            description: string | null;
            service_name: string | null;
          }>
        >`
          SELECT
            a.id,
            a.ticket_number,
            a.appointment_date,
            a.init_time,
            a.end_time,
            u.name as user_name,
            a.description,
            a.service_name
          FROM portal_ticket_appointments a
          INNER JOIN portal_tickets t ON t.ticket_number = a.ticket_number
          LEFT JOIN users u ON u.id = a.created_by
          WHERE t.client_external_id = ${clientId}
            AND a.appointment_date >= ${range.start}::date
            AND a.appointment_date <= ${range.end}::date
          ORDER BY a.appointment_date DESC, a.init_time DESC NULLS LAST
        `) ?? [];

      const questions =
        await this.prisma.rendimentoAppointmentQuestion.findMany({
          where: {
            companyId: params.companyId,
            appointmentDate: {
              gte: new Date(`${range.start}T12:00:00.000Z`),
              lte: new Date(`${range.end}T12:00:00.000Z`),
            },
          },
        });
      const questionByRef = new Map(
        questions.map((q) => [`${q.appointmentSource}:${q.appointmentRef}`, q]),
      );

      for (const row of portalOnly) {
        const date = this.formatDateOnly(row.appointment_date);
        if (!date) continue;
        const ref = row.id;
        const q =
          questionByRef.get(`portal:${ref}`) ??
          questionByRef.get(`tiflux:${ref}`);
        const minutes = this.minutesFromTimes(row.init_time, row.end_time);
        const desc = this.mapDescription(row.description);
        entries.push({
          source: 'portal',
          ref,
          ticketNumber: Number(row.ticket_number),
          date,
          initTime: row.init_time,
          endTime: row.end_time,
          minutes,
          hoursFormatted: this.formatMinutes(minutes),
          userName: row.user_name,
          ...desc,
          serviceName: row.service_name,
          question: q
            ? {
                id: q.id,
                status: q.status,
                message: q.message,
                adminResponse: q.adminResponse,
                adminResponseCode: q.adminResponseCode,
                abonado: q.abonado,
                createdAt: q.createdAt.toISOString(),
                respondedAt: q.respondedAt?.toISOString() ?? null,
              }
            : null,
        });
      }
    } else {
      const tifluxRows =
        (await this.prisma.$queryRaw<
          Array<{
            external_id: number;
            ticket_number: number;
            appointment_date: Date | null;
            init_time: Date | null;
            end_time: Date | null;
            user_name: string | null;
            description: string | null;
            valorization_raw: unknown;
          }>
        >`
          SELECT
            a.external_id,
            a.ticket_number,
            a.appointment_date,
            a.init_time,
            a.end_time,
            a.user_name,
            a.description,
            a.valorization_raw
          FROM tiflux.ticket_appointments a
          INNER JOIN tiflux.tickets t ON t.ticket_number = a.ticket_number
          WHERE t.client_external_id = ${clientId}
            AND a.appointment_date >= ${range.start}::date
            AND a.appointment_date <= ${range.end}::date
          ORDER BY a.appointment_date DESC, a.init_time DESC NULLS LAST
        `) ?? [];

      const portalRows = await this.prisma.portalTicketAppointment.findMany({
        where: {
          appointmentDate: {
            gte: new Date(`${range.start}T12:00:00.000Z`),
            lte: new Date(`${range.end}T12:00:00.000Z`),
          },
          syncStatus: { in: ['PORTAL_ONLY', 'PENDING_TIFLUX', 'SYNCED'] },
          tifluxAppointmentExternalId: null,
        },
        include: { creator: { select: { name: true } } },
        orderBy: [{ appointmentDate: 'desc' }, { initTime: 'desc' }],
      });

      const portalTicketNumbers = [
        ...new Set(portalRows.map((r) => r.ticketNumber)),
      ];
      const portalTickets =
        portalTicketNumbers.length > 0
          ? await this.prisma.portalTicket.findMany({
              where: { ticketNumber: { in: portalTicketNumbers } },
              select: { ticketNumber: true, clientExternalId: true },
            })
          : [];
      const ticketClientMap = new Map(
        portalTickets.map((t) => [t.ticketNumber, t.clientExternalId]),
      );

      const questions =
        await this.prisma.rendimentoAppointmentQuestion.findMany({
          where: {
            companyId: params.companyId,
            appointmentDate: {
              gte: new Date(`${range.start}T12:00:00.000Z`),
              lte: new Date(`${range.end}T12:00:00.000Z`),
            },
          },
        });
      const questionByRef = new Map(
        questions.map((q) => [`${q.appointmentSource}:${q.appointmentRef}`, q]),
      );

      for (const row of tifluxRows) {
        const date = this.formatDateOnly(row.appointment_date);
        if (!date) continue;
        const ref = String(row.external_id);
        const q = questionByRef.get(`tiflux:${ref}`);
        const minutes = this.minutesFromTimes(
          this.formatTime(row.init_time),
          this.formatTime(row.end_time),
        );
        const desc = this.mapDescription(row.description);
        entries.push({
          source: 'tiflux',
          ref,
          ticketNumber: Number(row.ticket_number),
          date,
          initTime: this.formatTime(row.init_time),
          endTime: this.formatTime(row.end_time),
          minutes,
          hoursFormatted: this.formatMinutes(minutes),
          userName: row.user_name,
          ...desc,
          serviceName: valorLabel(row.valorization_raw),
          question: q
            ? {
                id: q.id,
                status: q.status,
                message: q.message,
                adminResponse: q.adminResponse,
                adminResponseCode: q.adminResponseCode,
                abonado: q.abonado,
                createdAt: q.createdAt.toISOString(),
                respondedAt: q.respondedAt?.toISOString() ?? null,
              }
            : null,
        });
      }

      for (const row of portalRows) {
        if (ticketClientMap.get(row.ticketNumber) !== clientId) continue;
        const date = this.formatDateOnly(row.appointmentDate);
        if (!date) continue;
        const ref = row.id;
        const q = questionByRef.get(`portal:${ref}`);
        const minutes = this.minutesFromTimes(row.initTime, row.endTime);
        const desc = this.mapDescription(row.description);
        entries.push({
          source: 'portal',
          ref,
          ticketNumber: row.ticketNumber,
          date,
          initTime: row.initTime,
          endTime: row.endTime,
          minutes,
          hoursFormatted: this.formatMinutes(minutes),
          userName: row.creator.name,
          ...desc,
          serviceName: row.serviceName,
          question: q
            ? {
                id: q.id,
                status: q.status,
                message: q.message,
                adminResponse: q.adminResponse,
                adminResponseCode: q.adminResponseCode,
                abonado: q.abonado,
                createdAt: q.createdAt.toISOString(),
                respondedAt: q.respondedAt?.toISOString() ?? null,
              }
            : null,
        });
      }
    }

    const questions = await this.prisma.rendimentoAppointmentQuestion.findMany({
      where: {
        companyId: params.companyId,
        appointmentDate: {
          gte: new Date(`${range.start}T12:00:00.000Z`),
          lte: new Date(`${range.end}T12:00:00.000Z`),
        },
      },
    });

    const pendingByDate = new Map<string, number>();
    for (const q of questions) {
      if (q.status !== RendimentoAppointmentQuestionStatus.PENDING) continue;
      const date = this.formatDateOnly(q.appointmentDate);
      if (!date) continue;
      pendingByDate.set(date, (pendingByDate.get(date) ?? 0) + 1);
    }

    const dayMap = new Map<string, CompanyAppointmentEntryDto[]>();
    for (const entry of entries) {
      const list = dayMap.get(entry.date) ?? [];
      list.push(entry);
      dayMap.set(entry.date, list);
    }
    for (const date of pendingByDate.keys()) {
      if (!dayMap.has(date)) {
        dayMap.set(date, []);
      }
    }

    const days = [...dayMap.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, dayEntries]) => {
        const sorted = dayEntries.sort((a, b) =>
          String(a.initTime ?? '').localeCompare(String(b.initTime ?? '')),
        );
        const totalMinutes = sorted.reduce((sum, e) => sum + e.minutes, 0);
        const pendingFromEntries = sorted.filter(
          (e) => e.question?.status === 'PENDING',
        ).length;
        const pendingQuestions = Math.max(
          pendingFromEntries,
          pendingByDate.get(date) ?? 0,
        );
        return {
          date,
          totalMinutes,
          totalHoursFormatted: this.formatMinutes(totalMinutes),
          appointmentCount: sorted.length,
          pendingQuestions,
          entries: sorted,
        };
      });

    const totalMinutes = days.reduce((sum, d) => sum + d.totalMinutes, 0);
    const totalAppointments = days.reduce(
      (sum, d) => sum + d.appointmentCount,
      0,
    );
    const totalPendingQuestions = [...pendingByDate.values()].reduce(
      (sum, n) => sum + n,
      0,
    );

    return {
      company: {
        id: company.id,
        name: company.name,
        tifluxClientId: company.tifluxClientId,
        tifluxClientName: company.tifluxClientName,
      },
      date: refDate,
      view: params.view,
      rangeStart: range.start,
      rangeEnd: range.end,
      totalMinutes,
      totalHoursFormatted: this.formatMinutes(totalMinutes),
      totalAppointments,
      totalPendingQuestions,
      days,
    };
  }

  async createQuestion(params: {
    actor: AuthenticatedRequestUser;
    companyId: string;
    appointmentSource: 'tiflux' | 'portal';
    appointmentRef: string;
    ticketNumber: number;
    date: string;
    initTime?: string;
    endTime?: string;
    userName?: string;
    description?: string;
    message: string;
  }) {
    if (!isClientPortalRole(params.actor.role)) {
      throw new ForbiddenException(
        'Somente clientes podem questionar apontamentos.',
      );
    }
    await this.assertCompanyAccess(params.actor, params.companyId);
    const company = await this.getCompanyOrThrow(params.companyId);

    const message = params.message.trim();
    if (message.length < 10) {
      throw new BadRequestException(
        'Informe a justificativa do questionamento (mín. 10 caracteres).',
      );
    }

    const existing = await this.prisma.rendimentoAppointmentQuestion.findFirst({
      where: {
        companyId: params.companyId,
        appointmentSource: params.appointmentSource,
        appointmentRef: params.appointmentRef,
        status: RendimentoAppointmentQuestionStatus.PENDING,
      },
    });
    if (existing) {
      throw new BadRequestException(
        'Já existe um questionamento pendente para este apontamento.',
      );
    }

    const question = await this.prisma.rendimentoAppointmentQuestion.create({
      data: {
        companyId: params.companyId,
        appointmentSource: params.appointmentSource,
        appointmentRef: params.appointmentRef,
        ticketNumber: params.ticketNumber,
        appointmentDate: new Date(`${params.date}T12:00:00.000Z`),
        initTime: params.initTime ?? null,
        endTime: params.endTime ?? null,
        userName: params.userName?.trim() ?? null,
        description: params.description?.trim() ?? null,
        message,
        questionedBy: params.actor.userId,
      },
    });

    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', deletedAt: null, status: 'ACTIVE' },
      select: { email: true },
    });

    const questioner = await this.prisma.user.findUnique({
      where: { id: params.actor.userId },
      select: { name: true },
    });

    void this.mail.notifyAdminsAppointmentQuestion({
      companyName: company.name,
      ticketNumber: params.ticketNumber,
      appointmentDate: params.date,
      userName: params.userName ?? null,
      message,
      questionedByName: questioner?.name ?? 'Cliente',
      adminEmails: admins.map((a) => a.email),
      companyId: params.companyId,
    });

    return {
      ok: true,
      question: {
        id: question.id,
        status: question.status,
        message: question.message,
        createdAt: question.createdAt.toISOString(),
      },
    };
  }

  async answerQuestion(params: {
    actor: AuthenticatedRequestUser;
    questionId: string;
    responseNote: string;
    abonar?: boolean;
    responseCode?: string;
  }) {
    if (params.actor.role !== 'ADMIN') {
      throw new ForbiddenException('Somente administradores podem responder.');
    }

    const row = await this.prisma.rendimentoAppointmentQuestion.findUnique({
      where: { id: params.questionId },
    });
    if (!row) {
      throw new NotFoundException('Questionamento não encontrado.');
    }
    if (row.status !== RendimentoAppointmentQuestionStatus.PENDING) {
      throw new BadRequestException('Este questionamento já foi respondido.');
    }

    const note = params.responseNote.trim();
    if (note.length < 3) {
      throw new BadRequestException(
        'Informe a resposta ao cliente (mín. 3 caracteres).',
      );
    }

    const abonar = params.abonar === true;
    const code = abonar
      ? 'ABONADO'
      : params.responseCode?.trim() || 'RESPONDIDO';

    const updated = await this.prisma.rendimentoAppointmentQuestion.update({
      where: { id: params.questionId },
      data: {
        status: RendimentoAppointmentQuestionStatus.ANSWERED,
        adminResponseCode: code,
        adminResponse: note,
        abonado: abonar,
        respondedBy: params.actor.userId,
        respondedAt: new Date(),
      },
    });

    return {
      ok: true,
      question: {
        id: updated.id,
        status: updated.status,
        adminResponseCode: updated.adminResponseCode,
        adminResponse: updated.adminResponse,
        abonado: updated.abonado,
        respondedAt: updated.respondedAt?.toISOString() ?? null,
      },
    };
  }
}
