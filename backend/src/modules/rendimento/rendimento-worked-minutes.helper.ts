import { overtimeKindFromValorization } from './rendimento-day-insights';
import { hhmmDurationMinutes } from '../tickets/portal-appointment.helper';

export type WorkInterval = { start: number; end: number };

export type AppointmentMinutesInput = {
  appointment_date: string;
  init_time: string | null;
  end_time: string | null;
  minutes: number;
  valorization_raw?: unknown | null;
};

export type WorkedMinutesFilter = 'ALL' | 'EXTRA' | 'PLANTAO' | 'NORMAL';

/**
 * Converte HH:MM (ou HH:MM:SS) em minutos desde 00:00.
 * Segundos são ignorados (contrato: cálculo só em hora e minuto).
 * Valores fora de 00:00–23:59 → null (registro quebrado não vira minuto).
 */
export function parseClockToMinutes(
  value: string | null | undefined,
): number | null {
  if (!value?.trim()) return null;
  const parts = value.trim().split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Duração canônica de um apontamento, em minutos.
 * Única fonte de verdade (delega para `hhmmDurationMinutes`): HH:MM sem segundos,
 * aceita cruzar a meia-noite, qualquer entrada inválida → 0.
 */
export const appointmentDurationMinutes = hhmmDurationMinutes;

export function appointmentToInterval(
  initTime: string | null,
  endTime: string | null,
  minutes: number,
): WorkInterval | null {
  const start = parseClockToMinutes(initTime);
  if (start == null) return null;

  const duration = appointmentDurationMinutes(initTime, endTime);
  if (duration > 0) {
    return { start, end: start + duration };
  }

  // Sem fim utilizável: usa o campo `minutes` como último recurso, saneado.
  const fallback = Math.max(0, Math.trunc(Number(minutes) || 0));
  return { start, end: start + (fallback > 0 ? fallback : 1) };
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
  if (filter === 'NORMAL') return kind == null;
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
    const fromTimes = appointmentDurationMinutes(row.init_time, row.end_time);
    total +=
      fromTimes > 0
        ? fromTimes
        : Math.max(0, Math.trunc(Number(row.minutes) || 0));
  }
  return total;
}
