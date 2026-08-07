import { randomUUID } from 'crypto';

import type {
  RendimentoDayInsightsDto,
  RendimentoGapDto,
} from './rendimento-day-insights';

export type RendimentoEntryEventSource = {
  id: number;
  initTime: string | null;
  endTime: string | null;
  minutes: number;
  overtimeKind?: 'EXTRA' | 'PLANTAO' | null;
  description: string | null;
};

export type RendimentoDayEventType =
  | 'IDLE_ALERT'
  | 'LUNCH'
  | 'JUSTIFICATION'
  | 'OVERTIME'
  | 'PLANTAO';

export type RendimentoDayEventStatus =
  | 'ACTIVE'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED';

/** Decisões de HE/plantão que o sync nunca deve apagar (soft-delete). */
export const PROTECTED_OVERTIME_DECISION_STATUSES: RendimentoDayEventStatus[] =
  ['APPROVED', 'REJECTED'];

export function isProtectedOvertimeDecisionStatus(
  status: RendimentoDayEventStatus,
): boolean {
  return PROTECTED_OVERTIME_DECISION_STATUSES.includes(status);
}

export function dayEventStatusPriority(
  status: RendimentoDayEventStatus,
): number {
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

export type RendimentoDayEventRow = {
  id: string;
  user_id: string;
  date_ref: string;
  event_type: RendimentoDayEventType;
  from_time: string | null;
  to_time: string | null;
  minutes: number;
  appointment_external_id: number | null;
  justification_id: string | null;
  label: string | null;
  description: string | null;
  reason: string | null;
  status: RendimentoDayEventStatus;
  debit_protected: boolean;
  source_key: string;
};

export type UpsertDayEventInput = {
  userId: string;
  dateRef: string;
  eventType: RendimentoDayEventType;
  fromTime?: string | null;
  toTime?: string | null;
  minutes: number;
  appointmentExternalId?: number | null;
  justificationId?: string | null;
  label?: string | null;
  description?: string | null;
  reason?: string | null;
  status?: RendimentoDayEventStatus;
  debitProtected?: boolean;
};

export function buildDayEventSourceKey(parts: {
  eventType: RendimentoDayEventType;
  dateRef: string;
  fromTime?: string | null;
  toTime?: string | null;
  appointmentExternalId?: number | null;
  justificationId?: string | null;
}): string {
  return [
    parts.eventType,
    parts.dateRef.slice(0, 10),
    parts.fromTime ?? '',
    parts.toTime ?? '',
    parts.appointmentExternalId != null
      ? String(parts.appointmentExternalId)
      : '',
    parts.justificationId ?? '',
  ].join('|');
}

export function gapEventType(gap: RendimentoGapDto): 'IDLE_ALERT' | 'LUNCH' {
  return gap.type === 'lunch' ? 'LUNCH' : 'IDLE_ALERT';
}

export function justificationStatusToEventStatus(
  status: 'PENDING' | 'APPROVED' | 'REJECTED',
): RendimentoDayEventStatus {
  return status;
}

export function newDayEventId(): string {
  return randomUUID();
}

const MINUTES_PER_DAY = 24 * 60;

/** Normaliza HH:MM para coluna TIME do Postgres (0–23:59; valores ≥24h viram hora do dia seguinte). */
export function normalizeClockTimeForDb(
  value: string | null | undefined,
): string | null {
  if (value == null || !String(value).trim()) return null;
  const parts = String(value).trim().split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  let total = Math.trunc(h) * 60 + Math.trunc(m);
  if (total < 0) total = 0;
  total = total % MINUTES_PER_DAY;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function collectDayEventUpserts(params: {
  userId: string;
  dateRef: string;
  insights: RendimentoDayInsightsDto;
  entries: RendimentoEntryEventSource[];
}): UpsertDayEventInput[] {
  const items: UpsertDayEventInput[] = [];
  const dateRef = params.dateRef.slice(0, 10);

  for (const gap of params.insights.gaps) {
    const justification = gap.justification;
    if (justification) {
      items.push({
        userId: params.userId,
        dateRef,
        eventType: 'JUSTIFICATION',
        fromTime: gap.fromTime,
        toTime: gap.toTime,
        minutes: gap.gapMinutes,
        justificationId: justification.id,
        label: gap.label,
        reason: justification.reason,
        status: justificationStatusToEventStatus(justification.status),
      });
      continue;
    }

    items.push({
      userId: params.userId,
      dateRef,
      eventType: gapEventType(gap),
      fromTime: gap.fromTime,
      toTime: gap.toTime,
      minutes: gap.gapMinutes,
      label: gap.label,
      status: 'ACTIVE',
    });
  }

  for (const entry of params.entries) {
    if (!entry.overtimeKind) continue;
    items.push({
      userId: params.userId,
      dateRef,
      eventType: entry.overtimeKind === 'PLANTAO' ? 'PLANTAO' : 'OVERTIME',
      fromTime: entry.initTime,
      toTime: entry.endTime,
      minutes: entry.minutes,
      appointmentExternalId: entry.id,
      label: entry.overtimeKind === 'PLANTAO' ? 'Plantão' : 'Hora extra',
      description: entry.description,
      status: 'PENDING',
    });
  }

  return items;
}
