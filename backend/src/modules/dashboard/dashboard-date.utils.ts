import { BadRequestException } from '@nestjs/common';

export function toDateOrNull(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function toDateFromUnknown(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') return toDateOrNull(value);
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function getDefaultDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function normalizeRange(startDate: Date, endDate: Date) {
  const normalizedStart = new Date(startDate);
  const normalizedEnd = new Date(endDate);
  normalizedStart.setHours(0, 0, 0, 0);
  normalizedEnd.setHours(23, 59, 59, 999);
  if (normalizedEnd.getTime() <= normalizedStart.getTime()) {
    normalizedEnd.setTime(normalizedStart.getTime() + 1000);
  }
  return { startDate: normalizedStart, endDate: normalizedEnd };
}

export function buildTifluxDateRange(startDate: Date, endDate: Date) {
  const normalized = normalizeRange(startDate, endDate);
  return {
    startDate: normalized.startDate,
    endDate: normalized.endDate,
    startISO: normalized.startDate.toISOString(),
    endISO: normalized.endDate.toISOString(),
  };
}

export function toDateOnlyISO(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function getRange(start?: string, end?: string) {
  const fallback = getDefaultDateRange();
  const startParsed = toDateOrNull(start);
  const endParsed = toDateOrNull(end);
  if (start && !startParsed) {
    throw new BadRequestException('Data inicial inválida');
  }
  if (end && !endParsed) {
    throw new BadRequestException('Data final inválida');
  }
  const rawStartDate = startParsed ?? fallback.start;
  const rawEndDate = endParsed ?? fallback.end;
  return normalizeRange(rawStartDate, rawEndDate);
}

export function getMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function getMonthLabel(date: Date) {
  return date.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
}

export function getCalendarMonthBounds(
  monthOffset: number,
  reference: Date = new Date(),
) {
  const anchor = new Date(reference.getFullYear(), reference.getMonth(), 1);
  anchor.setMonth(anchor.getMonth() + monthOffset);
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(
    anchor.getFullYear(),
    anchor.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );

  return {
    start,
    end,
    monthKey: getMonthKey(start),
    monthLabel: getMonthLabel(start),
  };
}

export function getWeekStart(date: Date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysFromMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysFromMonday);
  return d;
}

export function getWeekKey(date: Date) {
  const start = getWeekStart(date);
  const year = start.getFullYear();
  const month = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getWeekLabel(weekStart: Date) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const dayFmt = (d: Date) =>
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  const startStr = dayFmt(weekStart);
  const endStr =
    weekEnd.getMonth() === weekStart.getMonth() &&
    weekEnd.getFullYear() === weekStart.getFullYear()
      ? weekEnd.toLocaleDateString('pt-BR', { day: '2-digit' })
      : dayFmt(weekEnd);
  return `${startStr} – ${endStr}`;
}

export function buildWeekMap(startDate: Date, endDate: Date) {
  const result = new Map<string, string>();
  const cursor = getWeekStart(startDate);
  const limit = getWeekStart(endDate);
  while (cursor <= limit) {
    result.set(getWeekKey(cursor), getWeekLabel(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return result;
}

export function buildMonthMap(startDate: Date, endDate: Date) {
  const result = new Map<string, string>();
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const limit = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  while (cursor <= limit) {
    result.set(getMonthKey(cursor), getMonthLabel(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return result;
}

export function countDaysInRange(startDate: Date, endDate: Date) {
  const diffMs = endDate.getTime() - startDate.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(diffDays, 1);
}
