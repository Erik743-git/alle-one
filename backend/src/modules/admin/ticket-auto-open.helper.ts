import { TicketAutoOpenPeriodicity } from '@prisma/client';

export const TICKET_AUTO_OPEN_PERIODICITY_VALUES = [
  'ONCE',
  'DAILY',
  'DAILY_WEEKDAYS',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'BIMONTHLY',
  'QUARTERLY',
] as const;

export type TicketAutoOpenPeriodicityValue =
  (typeof TICKET_AUTO_OPEN_PERIODICITY_VALUES)[number];

export function formatYmdUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseRuleDueAt(params: {
  nextScheduledDate: Date;
  scheduleTime: string;
}): Date {
  const ymd = formatYmdUtc(params.nextScheduledDate);
  const [h, m] = params.scheduleTime.split(':').map((part) => Number(part));
  const hh = Number.isFinite(h) ? h : 0;
  const mm = Number.isFinite(m) ? m : 0;
  return new Date(
    `${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-03:00`,
  );
}

function isWeekendUtc(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function advanceToNextWeekdayUtc(date: Date): Date {
  const next = new Date(date);
  do {
    next.setUTCDate(next.getUTCDate() + 1);
  } while (isWeekendUtc(next));
  return next;
}

export function advanceScheduledDate(
  current: Date,
  periodicity: TicketAutoOpenPeriodicity,
): Date {
  const next = new Date(current);
  switch (periodicity) {
    case TicketAutoOpenPeriodicity.ONCE:
      return next;
    case TicketAutoOpenPeriodicity.DAILY_WEEKDAYS:
      return advanceToNextWeekdayUtc(next);
    case TicketAutoOpenPeriodicity.WEEKLY:
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case TicketAutoOpenPeriodicity.BIWEEKLY:
      next.setUTCDate(next.getUTCDate() + 14);
      break;
    case TicketAutoOpenPeriodicity.MONTHLY:
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case TicketAutoOpenPeriodicity.BIMONTHLY:
      next.setUTCMonth(next.getUTCMonth() + 2);
      break;
    case TicketAutoOpenPeriodicity.QUARTERLY:
      next.setUTCMonth(next.getUTCMonth() + 3);
      break;
    default:
      next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

export const TICKET_AUTO_OPEN_PERIODICITY_LABELS: Record<
  TicketAutoOpenPeriodicity,
  string
> = {
  ONCE: 'Apenas uma vez',
  DAILY: 'Todo dia',
  DAILY_WEEKDAYS: 'Todo dia (sem fim de semana)',
  WEEKLY: 'Toda semana',
  BIWEEKLY: 'A cada duas semanas',
  MONTHLY: 'Todo mês',
  BIMONTHLY: 'A cada dois meses',
  QUARTERLY: 'A cada três meses',
};
