/**
 * Helpers Onda 2: apontamentos canônicos em portal_ticket_appointments.
 * Tempos são VARCHAR(5) HH:MM; serviço vem de service_name (sem valorization_raw).
 */

export type PortalAppointmentCommonShape = {
  ticketNumber: number;
  appointmentDate: string;
  initTime: string | null;
  endTime: string | null;
  minutes: number;
  clientExternalId: number | null;
  clientName: string | null;
  userName: string | null;
  serviceName: string;
  /** id numérico estável (tiflux external id ou hash do uuid portal) */
  appointmentExternalId: number;
  description: string | null;
};

/** Minutos a partir de HH:MM (ou HH:MM:SS). Aceita cruzar meia-noite. */
export function hhmmDurationMinutes(
  initTime: string | null | undefined,
  endTime: string | null | undefined,
): number {
  const start = parseHhMmToMinutes(initTime);
  const end = parseHhMmToMinutes(endTime);
  if (start == null || end == null) return 0;
  if (end > start) return end - start;
  if (end === start) return 0;
  return end + 24 * 60 - start;
}

export function parseHhMmToMinutes(
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

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetweenYmd(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00.000Z`);
  const b = new Date(`${to}T12:00:00.000Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** true se o fim é no dia seguinte (endDate explícito ou horário que volta). */
export function isOvernightAppointment(params: {
  date: string;
  initTime: string;
  endTime: string;
  endDate?: string | null;
}): boolean {
  const endDate = params.endDate?.trim();
  if (endDate && endDate !== params.date) return true;
  const start = parseHhMmToMinutes(params.initTime);
  const end = parseHhMmToMinutes(params.endTime);
  if (start == null || end == null) return false;
  return end < start;
}

export function appointmentDurationMinutes(params: {
  date: string;
  initTime: string;
  endTime: string;
  endDate?: string | null;
}): number {
  const start = parseHhMmToMinutes(params.initTime);
  const end = parseHhMmToMinutes(params.endTime);
  if (start == null || end == null) return 0;
  const daySpan = params.endDate?.trim()
    ? daysBetweenYmd(params.date, params.endDate.trim())
    : end < start
      ? 1
      : 0;
  if (daySpan < 0) return 0;
  return end + daySpan * 24 * 60 - start;
}

function hhmmToDaySegments(
  initTime: string | null | undefined,
  endTime: string | null | undefined,
): Array<[number, number]> {
  const start = parseHhMmToMinutes(initTime);
  const end = parseHhMmToMinutes(endTime);
  if (start == null || end == null) return [];
  if (end > start) return [[start, end]];
  if (end === start) return [];
  return [
    [start, 24 * 60],
    [0, end],
  ];
}

/**
 * Intervalos [init, end) em HH:MM.
 * Aceita cruzar meia-noite (23:00–08:00).
 */
export function hhmmIntervalsOverlap(
  aInit: string | null | undefined,
  aEnd: string | null | undefined,
  bInit: string | null | undefined,
  bEnd: string | null | undefined,
): boolean {
  const aSegs = hhmmToDaySegments(aInit, aEnd);
  const bSegs = hhmmToDaySegments(bInit, bEnd);
  for (const [a1, a2] of aSegs) {
    for (const [b1, b2] of bSegs) {
      if (Math.max(a1, b1) < Math.min(a2, b2)) return true;
    }
  }
  return false;
}

export function overtimeKindFromServiceName(
  serviceName: string | null | undefined,
): 'EXTRA' | 'PLANTAO' | null {
  const upper = (serviceName ?? '').toUpperCase();
  if (upper.includes('PLANTAO') || upper.includes('PLANTÃO')) return 'PLANTAO';
  if (upper.includes('HORA EXTRA') || upper.includes('HORAS EXTRA')) {
    return 'EXTRA';
  }
  return null;
}

/** Sintetiza shape aceito por overtimeKindFromValorization / getValorizationServiceName. */
export function serviceNameToValorizationRaw(
  serviceName: string | null | undefined,
): { name: string } {
  const name = (serviceName ?? '').trim() || 'HORA NORMAL';
  return { name };
}

/**
 * Id numérico estável para APIs que ainda tipam appointment_id como number.
 * Preferir tiflux_appointment_external_id; senão hashtext-like a partir do uuid.
 */
export function portalAppointmentNumericId(
  tifluxExternalId: number | null | undefined,
  portalId: string,
): number {
  if (
    tifluxExternalId != null &&
    Number.isFinite(Number(tifluxExternalId)) &&
    Number(tifluxExternalId) > 0
  ) {
    return Math.trunc(Number(tifluxExternalId));
  }
  let hash = 0;
  for (let i = 0; i < portalId.length; i++) {
    hash = (hash * 31 + portalId.charCodeAt(i)) | 0;
  }
  // Evita 0; mantém positivo
  return Math.abs(hash) || 1;
}
