import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TifluxService } from '../tiflux/tiflux.service';
import type { RendimentoCalendarView } from './rendimento.dto';

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
};

export type RendimentoDaySummaryDto = {
  date: string;
  totalMinutes: number;
  totalHoursFormatted: string;
  entries: RendimentoEntryDto[];
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
};

@Injectable()
export class RendimentoService {
  private readonly tifluxUserByEmail = new Map<
    string,
    { id: number; name: string } | null
  >();

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

    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 0);
    return { start, end };
  }

  private async resolveTifluxUser(
    email: string,
  ): Promise<{ id: number; name: string } | null> {
    const normalized = email.trim().toLowerCase();
    if (this.tifluxUserByEmail.has(normalized)) {
      return this.tifluxUserByEmail.get(normalized) ?? null;
    }

    try {
      const users = await this.tifluxService.getUsers({
        type: 'attendant',
        active: true,
        email: normalized,
        limit: 5,
      });
      const match = users.find(
        (user) => user.email?.trim().toLowerCase() === normalized,
      );
      const id = match?.id != null ? Number(match.id) : null;
      const resolved =
        id != null && !Number.isNaN(id)
          ? { id, name: String(match?.name ?? '').trim() || `Atendente ${id}` }
          : null;
      this.tifluxUserByEmail.set(normalized, resolved);
      return resolved;
    } catch {
      this.tifluxUserByEmail.set(normalized, null);
      return null;
    }
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
    }));
  }

  private groupByDay(entries: RendimentoEntryDto[]): RendimentoDaySummaryDto[] {
    const map = new Map<string, RendimentoEntryDto[]>();

    for (const entry of entries) {
      const key = entry.date;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(entry);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayEntries]) => {
        const totalMinutes = dayEntries.reduce(
          (sum, item) => sum + item.minutes,
          0,
        );
        return {
          date,
          totalMinutes,
          totalHoursFormatted: this.formatMinutes(totalMinutes),
          entries: dayEntries,
        };
      });
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
        role: { in: [UserRole.ADMIN, UserRole.COLLABORATOR] },
      },
      include: { company: true },
      orderBy: { name: 'asc' },
    });

    const { start, end } = this.currentMonthRange();
    const collaborators: RendimentoCollaboratorDto[] = [];

    for (const user of users) {
      const tifluxUser = await this.resolveTifluxUser(user.email);
      let monthTotalMinutes = 0;

      if (tifluxUser != null) {
        const monthRows = await this.fetchAppointments({
          tifluxUserId: tifluxUser.id,
          start,
          end,
        });
        monthTotalMinutes = monthRows.reduce(
          (sum, row) => sum + (Number(row.minutes) || 0),
          0,
        );
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
    userId: string;
    view: RendimentoCalendarView;
    date?: string;
  }): Promise<RendimentoTimesheetDto> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: params.userId,
        deletedAt: null,
        role: { in: [UserRole.ADMIN, UserRole.COLLABORATOR] },
      },
    });

    if (!user) {
      throw new NotFoundException('Colaborador não encontrado.');
    }

    const reference = this.parseDateOnly(params.date);
    const { start, end } = this.resolveRange(params.view, reference);
    const tifluxUser = await this.resolveTifluxUser(user.email);

    if (tifluxUser == null) {
      return {
        userId: user.id,
        userName: user.name,
        view: params.view,
        referenceDate: this.toDateOnlyString(reference),
        rangeStart: this.toDateOnlyString(start),
        rangeEnd: this.toDateOnlyString(end),
        totalMinutes: 0,
        totalHoursFormatted: this.formatMinutes(0),
        days: [],
      };
    }

    const rows = await this.fetchAppointments({
      tifluxUserId: tifluxUser.id,
      start,
      end,
    });
    const entries = this.mapEntries(rows);
    const totalMinutes = entries.reduce((sum, item) => sum + item.minutes, 0);

    return {
      userId: user.id,
      userName: user.name,
      view: params.view,
      referenceDate: this.toDateOnlyString(reference),
      rangeStart: this.toDateOnlyString(start),
      rangeEnd: this.toDateOnlyString(end),
      totalMinutes,
      totalHoursFormatted: this.formatMinutes(totalMinutes),
      days: this.groupByDay(entries),
    };
  }
}
