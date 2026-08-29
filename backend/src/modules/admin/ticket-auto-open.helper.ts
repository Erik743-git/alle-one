import { TicketAutoOpenPeriodicity } from '@prisma/client';

/** Responsável automático (criador da regra) — não é ID TiFlux válido. */
export const TICKET_AUTO_OPEN_AUTO_RESPONSIBLE = 0;

export const TICKET_AUTO_OPEN_PERIODICITY_VALUES = [
  'ONCE',
  'DAILY',
  'DAILY_WEEKDAYS',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'BIMONTHLY',
  'QUARTERLY',
  'SEMIANNUAL',
  'YEARLY',
] as const;

export type TicketAutoOpenPeriodicityValue =
  (typeof TICKET_AUTO_OPEN_PERIODICITY_VALUES)[number];

const BRT_OFFSET = '-03:00';

export function formatYmdUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseYmdToUtcDate(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000Z`);
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
    `${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00${BRT_OFFSET}`,
  );
}

function getWeekdayInBrt(date: Date): number {
  const ymd = formatYmdUtc(date);
  return new Date(`${ymd}T12:00:00${BRT_OFFSET}`).getDay();
}

function isWeekendInBrt(date: Date): boolean {
  const day = getWeekdayInBrt(date);
  return day === 0 || day === 6;
}

function advanceToNextWeekdayBrt(date: Date): Date {
  const next = new Date(date);
  do {
    next.setUTCDate(next.getUTCDate() + 1);
  } while (isWeekendInBrt(next));
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
      return advanceToNextWeekdayBrt(next);
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
    case TicketAutoOpenPeriodicity.SEMIANNUAL:
      next.setUTCMonth(next.getUTCMonth() + 6);
      break;
    case TicketAutoOpenPeriodicity.YEARLY:
      next.setUTCFullYear(next.getUTCFullYear() + 1);
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
  SEMIANNUAL: 'A cada seis meses',
  YEARLY: 'A cada um ano',
};

export function resolveAutoOpenResponsibleId(
  responsibleExternalId: number | null,
): number | null | undefined {
  if (responsibleExternalId === TICKET_AUTO_OPEN_AUTO_RESPONSIBLE) {
    return undefined;
  }
  return responsibleExternalId;
}

export function normalizeAutoOpenResponsibleStorage(
  responsibleId: number | null | undefined,
): number | null {
  if (responsibleId === null) return null;
  if (responsibleId === undefined) return TICKET_AUTO_OPEN_AUTO_RESPONSIBLE;
  return responsibleId;
}
