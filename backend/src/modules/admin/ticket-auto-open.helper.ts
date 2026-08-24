import { TicketAutoOpenPeriodicity } from '@prisma/client';

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

export function advanceScheduledDate(
  current: Date,
  periodicity: TicketAutoOpenPeriodicity,
): Date {
  const next = new Date(current);
  switch (periodicity) {
    case TicketAutoOpenPeriodicity.WEEKLY:
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case TicketAutoOpenPeriodicity.MONTHLY:
      next.setUTCMonth(next.getUTCMonth() + 1);
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
  DAILY: 'Todo dia',
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensal',
};
