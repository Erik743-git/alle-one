import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  RendimentoDayEventRow,
  RendimentoDayEventStatus,
  RendimentoDayEventType,
} from './rendimento-day-events.helper';
type RendimentoJustificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type RendimentoJustificationKind = 'ALERT' | 'VOLUNTARY';

export type GapJustificationRow = {
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

function formatDbTime(value: Date | null | undefined): string | null {
  if (!value) return null;
  const hours = value.getUTCHours();
  const minutes = value.getUTCMinutes();
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function toDateOnlyString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

@Injectable()
export class RendimentoStoreService {
  constructor(private readonly prisma: PrismaService) {}

  async listDayEvents(params: {
    userId: string;
    start: Date;
    end: Date;
  }): Promise<RendimentoDayEventRow[]> {
    const rows = await this.prisma.rendimentoDayEvent.findMany({
      where: {
        userId: params.userId,
        deletedAt: null,
        dateRef: {
          gte: params.start,
          lte: params.end,
        },
      },
      orderBy: [{ dateRef: 'asc' }, { fromTime: 'asc' }],
    });

    return rows.map((row) => ({
      id: row.id,
      user_id: row.userId,
      date_ref: toDateOnlyString(row.dateRef),
      event_type: row.eventType as RendimentoDayEventType,
      from_time: formatDbTime(row.fromTime),
      to_time: formatDbTime(row.toTime),
      minutes: row.minutes,
      appointment_external_id:
        row.appointmentExternalId != null
          ? Number(row.appointmentExternalId)
          : null,
      justification_id: row.justificationId,
      label: row.label,
      description: row.description,
      reason: row.reason,
      status: row.status as RendimentoDayEventStatus,
      debit_protected: row.debitProtected,
      source_key: row.sourceKey,
    }));
  }

  async listJustifications(params: {
    userId: string;
    start: Date;
    end: Date;
  }): Promise<GapJustificationRow[]> {
    const rows = await this.prisma.rendimentoGapJustification.findMany({
      where: {
        userId: params.userId,
        deletedAt: null,
        dateRef: {
          gte: params.start,
          lte: params.end,
        },
      },
      orderBy: [{ dateRef: 'asc' }, { fromTime: 'asc' }, { createdAt: 'desc' }],
    });

    if (!rows.length) return [];

    const userIds = new Set<string>();
    for (const row of rows) {
      userIds.add(row.createdBy);
      if (row.approvedBy) userIds.add(row.approvedBy);
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, name: true },
    });
    const nameById = new Map(users.map((user) => [user.id, user.name ?? '']));

    return rows.map((row) => ({
      id: row.id,
      user_id: row.userId,
      date_ref: toDateOnlyString(row.dateRef),
      from_time: formatDbTime(row.fromTime) ?? '00:00',
      to_time: formatDbTime(row.toTime) ?? '00:00',
      gap_type: row.gapType as 'idle' | 'lunch',
      gap_minutes: row.gapMinutes,
      kind: row.kind as RendimentoJustificationKind,
      status: row.status as RendimentoJustificationStatus,
      reason: row.reason,
      debit_overtime: row.debitOvertime,
      overtime_minutes: row.overtimeMinutes,
      created_by: nameById.get(row.createdBy) ?? row.createdBy,
      created_at: row.createdAt.toISOString(),
      approved_by: row.approvedBy
        ? (nameById.get(row.approvedBy) ?? row.approvedBy)
        : null,
      approved_at: row.approvedAt?.toISOString() ?? null,
    }));
  }
}
