const MINUTES_PER_DAY = 24 * 60;
const MAX_JUSTIFICATION_MINUTES = MINUTES_PER_DAY;

export function parseClockToMinutes(value: string): number | null {
  const raw = String(value ?? "").trim().slice(0, 5);
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Período no eixo estendido; se fim ≤ início no relógio, assume dia seguinte. */
export function resolvePeriodSpanMinutes(
  from: string,
  to: string,
): { from: number; to: number; gapMinutes: number } | null {
  const start = parseClockToMinutes(from);
  let end = parseClockToMinutes(to);
  if (start === null || end === null) return null;
  if (end <= start) {
    end += MINUTES_PER_DAY;
  }
  if (end <= start) return null;
  return { from: start, to: end, gapMinutes: end - start };
}

export function isInvalidSameTimePeriod(from: string, to: string): boolean {
  if (!from.trim() || !to.trim()) return false;
  return resolvePeriodSpanMinutes(from, to) === null;
}

export function minutesBetweenClockTimes(from: string, to: string): number {
  return resolvePeriodSpanMinutes(from, to)?.gapMinutes ?? 0;
}

/** Alerta que cruza meia-noite (ex. 20:00→03:00) usa gapMinutes no eixo estendido. */
export function resolveAlertSpanMinutes(
  alertFrom: string,
  alertTo: string,
  alertGapMinutes?: number,
): { from: number; to: number } | null {
  const from = parseClockToMinutes(alertFrom);
  const clockTo = parseClockToMinutes(alertTo);
  if (from === null || clockTo === null) return null;
  if (clockTo > from) {
    return { from, to: clockTo };
  }
  const span =
    alertGapMinutes && alertGapMinutes > 0
      ? alertGapMinutes
      : clockTo + MINUTES_PER_DAY - from;
  return { from, to: from + span };
}

export function isPeriodWithinAlertBounds(params: {
  from: string;
  to: string;
  alertFrom: string;
  alertTo: string;
  alertGapMinutes?: number;
}): boolean {
  const period = resolvePeriodSpanMinutes(params.from, params.to);
  const span = resolveAlertSpanMinutes(
    params.alertFrom,
    params.alertTo,
    params.alertGapMinutes,
  );
  if (!period || !span) return false;
  return period.from >= span.from && period.to <= span.to;
}
