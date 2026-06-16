import { overtimeKindFromValorization } from './rendimento-day-insights';

export type WorkInterval = { start: number; end: number };

export type AppointmentMinutesInput = {
  appointment_date: string;
  init_time: string | null;
  end_time: string | null;
  minutes: number;
  valorization_raw?: unknown | null;
};

export type WorkedMinutesFilter = 'ALL' | 'EXTRA' | 'PLANTAO';

export function parseClockToMinutes(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const parts = value.trim().split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return Math.max(0, Math.trunc(h) * 60 + Math.trunc(m));
}

export function appointmentToInterval(
  initTime: string | null,
  endTime: string | null,
  minutes: number,
): WorkInterval | null {
  const start = parseClockToMinutes(initTime);
  if (start == null) return null;

  let end = parseClockToMinutes(endTime);
  const duration = Math.max(0, Math.trunc(Number(minutes) || 0));
  if (end == null || end <= start) {
    end = start + (duration > 0 ? duration : 1);
  }

  return { start, end };
}

export function mergeIntervals(intervals: WorkInterval[]): WorkInterval[] {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: WorkInterval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

export function unionIntervalMinutes(intervals: WorkInterval[]): number {
  return mergeIntervals(intervals).reduce(
    (sum, item) => sum + Math.max(0, item.end - item.start),
    0,
  );
}

function matchesFilter(
  kind: ReturnType<typeof overtimeKindFromValorization>,
  filter: WorkedMinutesFilter,
): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'EXTRA') return kind === 'EXTRA';
  if (filter === 'PLANTAO') return kind === 'PLANTAO';
  return true;
}

/** Soma de minutos trabalhados no período, sem contar sobreposição no mesmo dia. */
export function computeUnionWorkedMinutes(
  rows: AppointmentMinutesInput[],
  filter: WorkedMinutesFilter = 'ALL',
): number {
  let orphanMinutes = 0;
  const byDate = new Map<string, WorkInterval[]>();

  for (const row of rows) {
    const kind = overtimeKindFromValorization(row.valorization_raw);
    if (!matchesFilter(kind, filter)) continue;

    const interval = appointmentToInterval(
      row.init_time,
      row.end_time,
      row.minutes,
    );
    if (!interval) {
      orphanMinutes += Math.max(0, Math.trunc(Number(row.minutes) || 0));
      continue;
    }

    const dateKey = row.appointment_date.slice(0, 10);
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey)!.push(interval);
  }

  let total = orphanMinutes;
  for (const intervals of byDate.values()) {
    total += unionIntervalMinutes(intervals);
  }
  return total;
}

/** Soma bruta dos minutos de cada apontamento (ticket a ticket), sem deduplicar sobreposição. */
export function computeRawAppointmentMinutes(
  rows: AppointmentMinutesInput[],
  filter: WorkedMinutesFilter = 'ALL',
): number {
  let total = 0;
  for (const row of rows) {
    const kind = overtimeKindFromValorization(row.valorization_raw);
    if (!matchesFilter(kind, filter)) continue;
    total += Math.max(0, Math.trunc(Number(row.minutes) || 0));
  }
  return total;
}
