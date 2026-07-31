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
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Interpreta YYYY-MM-DD como data de calendário (sem deslocar por UTC). */
export function parsePortalDateOnly(value: string, label?: string): Date {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    throw new BadRequestException(
      label ? `${label} inválida` : 'Data inválida',
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    throw new BadRequestException(
      label ? `${label} inválida` : 'Data inválida',
    );
  }

  return parsed;
}

export function parseDateInput(value: string, label?: string): Date {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return parsePortalDateOnly(trimmed, label);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(
      label ? `${label} inválida` : 'Data inválida',
    );
  }

  return parsed;
}

function formatPeriodLabel(start: Date, end: Date) {
  const sameMonth =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();
  const lastDayOfMonth = new Date(
    end.getFullYear(),
    end.getMonth() + 1,
    0,
  ).getDate();
  const isFullMonth =
    sameMonth && start.getDate() === 1 && end.getDate() === lastDayOfMonth;

  if (isFullMonth) {
    return getMonthLabel(start);
  }

  const monthYear = end.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });

  if (sameMonth) {
    return `${start.getDate()} a ${end.getDate()} de ${monthYear}`;
  }

  return `${start.toLocaleDateString('pt-BR')} a ${end.toLocaleDateString('pt-BR')}`;
}

/** Mês calendário limitado ao dia de referência (comparação mês atual vs anterior até o mesmo dia). */
export function getCalendarMonthBoundsToDate(
  monthOffset: number,
  reference: Date = new Date(),
) {
  const bounds = getCalendarMonthBounds(monthOffset, reference);
  const today = new Date(reference);
  const todayEnd = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    23,
    59,
    59,
    999,
  );

  if (monthOffset === 0 && todayEnd.getTime() < bounds.end.getTime()) {
    bounds.end = todayEnd;
  }

  if (monthOffset === -1) {
    const compareDay = Math.min(today.getDate(), bounds.end.getDate());
    bounds.end = new Date(
      bounds.start.getFullYear(),
      bounds.start.getMonth(),
      compareDay,
      23,
      59,
      59,
      999,
    );
  }

  return {
    ...bounds,
    periodLabel: formatPeriodLabel(bounds.start, bounds.end),
  };
}

export function getRange(start?: string, end?: string) {
  const fallback = getDefaultDateRange();
  let startParsed: Date | null = null;
  let endParsed: Date | null = null;

  if (start) {
    try {
      startParsed = /^\d{4}-\d{2}-\d{2}$/.test(start.trim())
        ? parsePortalDateOnly(start, 'Data inicial')
        : toDateOrNull(start);
    } catch {
      throw new BadRequestException('Data inicial inválida');
    }
    if (!startParsed) {
      throw new BadRequestException('Data inicial inválida');
    }
  }

  if (end) {
    try {
      endParsed = /^\d{4}-\d{2}-\d{2}$/.test(end.trim())
        ? parsePortalDateOnly(end, 'Data final')
        : toDateOrNull(end);
    } catch {
      throw new BadRequestException('Data final inválida');
    }
    if (!endParsed) {
      throw new BadRequestException('Data final inválida');
    }
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
  const start = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    1,
    0,
    0,
    0,
    0,
  );
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
