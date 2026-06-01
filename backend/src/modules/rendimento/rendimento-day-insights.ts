export type RendimentoEntryInput = {
  id: number;
  date: string;
  initTime: string | null;
  endTime: string | null;
  minutes: number;
  hoursFormatted: string;
  ticketNumber: number;
  clientName: string | null;
  description: string | null;
};

/** Expediente: 4h trabalho + almoço 1h30 + 4h trabalho (8h apontadas). */
export const REGULAR_DAY_MINUTES = 8 * 60;
export const WORK_BEFORE_LUNCH_MINUTES = 4 * 60;
export const LUNCH_MINUTES = 90;
/** Alerta só se ficar *mais* de 1 hora sem apontar (estritamente > 60 min). */
export const GAP_ALERT_MINUTES = 60;

export type RendimentoGapDto = {
  type: 'idle' | 'lunch';
  fromTime: string;
  toTime: string;
  gapMinutes: number;
  label: string;
  justification?: {
    id: string;
    kind: 'ALERT' | 'VOLUNTARY';
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    gapType?: 'idle' | 'lunch';
    reason: string;
    debitOvertime: boolean;
    overtimeMinutes: number;
    createdBy: string;
    createdAt: string;
    approvedBy: string | null;
    approvedAt: string | null;
  };
};

export type RendimentoDayInsightsDto = {
  regularMinutes: number;
  overtimeMinutes: number;
  hasOvertime: boolean;
  hasIdleGapAlert: boolean;
  hasExpectedLunch: boolean;
  gaps: RendimentoGapDto[];
};

export type RendimentoEntryEnriched = RendimentoEntryInput & {
  isOvertime: boolean;
  /** Hora extra diferenciada (ex.: plantão). */
  overtimeKind?: 'EXTRA' | 'PLANTAO' | null;
  /** Nome do tipo de serviço no TiFlux (ex.: "Plantão", "HORA EXTRA"). */
  valorizationServiceName?: string | null;
};

function parseTimeToMinutes(value: string | null): number | null {
  if (!value?.trim()) return null;
  const parts = value.trim().split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function parseHHMMToMinutes(value: string): number | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

const MINUTES_PER_DAY = 24 * 60;

function formatMinutesAsTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.trunc(totalMinutes));
  const wrapped = clamped % MINUTES_PER_DAY;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function getValorizationServiceName(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  const candidates = [
    (v.loose_service as { name?: unknown } | undefined)?.name,
    (v.contract as { name?: unknown } | undefined)?.name,
    (v.service as { name?: unknown } | undefined)?.name,
    (v.way as { name?: unknown } | undefined)?.name,
    v.name,
  ];
  for (const candidate of candidates) {
    const name = String(candidate ?? '').trim();
    if (name) return name;
  }
  return null;
}

function normalizeHaystack(raw: unknown): string {
  if (raw == null) return '';
  try {
    return JSON.stringify(raw).toLowerCase();
  } catch {
    return '';
  }
}

export function overtimeKindFromValorization(
  raw: unknown,
): 'EXTRA' | 'PLANTAO' | null {
  const serviceName = getValorizationServiceName(raw);
  const upper = serviceName?.toUpperCase() ?? '';

  // Plantão deve seguir as MESMAS regras de HE (fica fora da jornada regular),
  // mas com visual diferente no calendário.
  if (upper.includes('PLANTAO') || upper.includes('PLANTÃO')) {
    return 'PLANTAO';
  }
  if (upper.includes('HORA EXTRA') || upper.includes('HORAS EXTRA')) {
    return 'EXTRA';
  }
  if (upper.includes('HORA NORMAL')) {
    return null;
  }

  const hay = normalizeHaystack(raw);
  if (hay.includes('plantao') || hay.includes('plantão')) return 'PLANTAO';
  if (hay.includes('hora extra') || hay.includes('horas extra')) return 'EXTRA';
  return null;
}

/** Hora extra vem do tipo de serviço no TiFlux (valorization), não da soma do dia. */
export function isOvertimeValorization(raw: unknown): boolean {
  return overtimeKindFromValorization(raw) != null;
}

function sortEntriesByStart(entries: RendimentoEntryInput[]) {
  return [...entries].sort((a, b) => {
    const am = parseTimeToMinutes(a.initTime) ?? 0;
    const bm = parseTimeToMinutes(b.initTime) ?? 0;
    if (am !== bm) return am - bm;
    return a.id - b.id;
  });
}

function workMinutesBeforeTime(
  entries: RendimentoEntryInput[],
  gapStartMinutes: number,
): number {
  let sum = 0;
  for (const entry of entries) {
    const startMin = parseTimeToMinutes(entry.initTime);
    const endMin =
      parseTimeToMinutes(entry.endTime) ??
      (startMin != null ? startMin + entry.minutes : null);
    if (endMin != null && endMin <= gapStartMinutes) {
      sum += entry.minutes;
    }
  }
  return sum;
}

function pickLunchGap(gaps: RendimentoGapDto[], entries: RendimentoEntryInput[]) {
  // Regra de negócio: por dia, "perdoa" 1 alerta transformando o gap mais próximo de 1h30 em almoço.
  // Não depende de já ter 4h trabalhadas antes (na prática, gaps variam muito).
  const candidates = gaps.filter((gap) => gap.type === 'idle' && gap.gapMinutes > GAP_ALERT_MINUTES);

  return candidates.sort((a, b) => {
    const diffA = Math.abs(a.gapMinutes - LUNCH_MINUTES);
    const diffB = Math.abs(b.gapMinutes - LUNCH_MINUTES);
    if (diffA !== diffB) return diffA - diffB;
    // Empate: prefere o maior gap (mais provável de ser almoço de verdade).
    if (a.gapMinutes !== b.gapMinutes) return b.gapMinutes - a.gapMinutes;
    return a.fromTime.localeCompare(b.fromTime);
  })[0];
}

function splitFirstLongIdleGapIntoLunch(gaps: RendimentoGapDto[]): boolean {
  const idx = gaps.findIndex((g) => g.type === 'idle' && g.gapMinutes >= LUNCH_MINUTES);
  if (idx < 0) return false;

  const gap = gaps[idx];
  const from = parseTimeToMinutes(gap.fromTime);
  const to = parseTimeToMinutes(gap.toTime);
  if (from == null || to == null) return false;
  if (to - from < LUNCH_MINUTES) return false;

  const lunchEnd = from + LUNCH_MINUTES;
  const lunch: RendimentoGapDto = {
    type: 'lunch',
    fromTime: formatMinutesAsTime(from),
    toTime: formatMinutesAsTime(lunchEnd),
    gapMinutes: LUNCH_MINUTES,
    label: `Almoço (${formatMinutesAsTime(LUNCH_MINUTES)})`,
  };

  // Sobrou tempo depois do almoço? Mantém como "idle".
  const remainingFrom = lunchEnd;
  const remainingTo = to;
  const remainingMinutes = remainingTo - remainingFrom;

  const next: RendimentoGapDto[] = [];
  for (let i = 0; i < gaps.length; i += 1) {
    if (i !== idx) {
      next.push(gaps[i]);
      continue;
    }
    next.push(lunch);
    if (remainingMinutes > 0) {
      next.push({
        type: 'idle',
        fromTime: formatMinutesAsTime(remainingFrom),
        toTime: formatMinutesAsTime(remainingTo),
        gapMinutes: remainingMinutes,
        label: `${remainingMinutes} min sem apontamento`,
      });
    }
  }

  gaps.splice(0, gaps.length, ...next);
  return true;
}

function addIdleGap(
  gaps: RendimentoGapDto[],
  fromMinutes: number,
  toMinutes: number,
) {
  const gapMinutes = toMinutes - fromMinutes;
  if (gapMinutes > GAP_ALERT_MINUTES) {
    gaps.push({
      type: 'idle',
      fromTime: formatMinutesAsTime(fromMinutes),
      toTime: formatMinutesAsTime(toMinutes),
      gapMinutes,
      label: `${gapMinutes} min sem apontamento`,
    });
  }
}

function isSameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(dateIsoLike: string): boolean {
  const d = new Date(String(dateIsoLike));
  if (Number.isNaN(d.getTime())) return false;
  return isSameLocalDate(d, new Date());
}

export function analyzeRendimentoDay(
  entries: RendimentoEntryInput[],
  valorizationById?: Map<number, unknown>,
): {
  entries: RendimentoEntryEnriched[];
  insights: RendimentoDayInsightsDto;
} {
  const sorted = sortEntriesByStart(entries);
  const gaps: RendimentoGapDto[] = [];
  let lunchFound = false;
  const dayIsToday = sorted.length > 0 ? isToday(sorted[0].date) : false;

  // Enriquecimento (hora extra vem do TiFlux, não da soma).
  const enriched: RendimentoEntryEnriched[] = sorted.map((entry) => {
    const valorization = valorizationById?.get(entry.id);
    const valorizationServiceName = getValorizationServiceName(valorization);
    const overtimeKind = overtimeKindFromValorization(valorization);
    return {
      ...entry,
      isOvertime: overtimeKind != null,
      overtimeKind,
      valorizationServiceName,
    };
  });

  // Para alertas/almoço, consideramos apenas jornada regular (HORA NORMAL),
  // e só depois do primeiro apontamento regular do dia (HE é "à parte").
  const firstRegularIdx = enriched.findIndex((e) => !e.isOvertime);
  const regularEntries =
    firstRegularIdx >= 0 ? enriched.slice(firstRegularIdx).filter((e) => !e.isOvertime) : [];
  const regularWorkedMinutes = regularEntries.reduce((sum, e) => sum + e.minutes, 0);

  // Alertas valem só enquanto a jornada "regular" (8h) não foi completada.
  let runningRegularMinutes = 0;

  for (let index = 0; index < regularEntries.length; index += 1) {
    const entry = regularEntries[index];
    const startMin = parseTimeToMinutes(entry.initTime);
    const entryMinutes = Math.max(0, Math.trunc(Number(entry.minutes) || 0));

    if (index > 0 && startMin != null) {
      const prev = regularEntries[index - 1];
      const prevEnd =
        parseTimeToMinutes(prev.endTime) ??
        (parseTimeToMinutes(prev.initTime) != null
          ? parseTimeToMinutes(prev.initTime)! + prev.minutes
          : null);

      if (prevEnd != null) {
        if (runningRegularMinutes < REGULAR_DAY_MINUTES) {
          addIdleGap(gaps, prevEnd, startMin);
        }
      }
    }

    runningRegularMinutes += entryMinutes;
  }

  // Se existir um gap compatível, ele vira almoço.
  // Caso não exista e o dia só tenha 1 apontamento, criamos um almoço fixo de 1h30
  // a partir do fim do apontamento (quando couber dentro do expediente).
  const lunchCandidate = pickLunchGap(gaps, regularEntries);
  if (lunchCandidate) {
    lunchFound = true;
    lunchCandidate.type = 'lunch';
    lunchCandidate.label = `Almoço (${formatMinutesAsTime(LUNCH_MINUTES)})`;
  } else if (splitFirstLongIdleGapIntoLunch(gaps)) {
    lunchFound = true;
  } else if (regularEntries.length === 1) {
    const last = regularEntries[regularEntries.length - 1];
    const lastStart = parseTimeToMinutes(last.initTime);
    const lastEnd =
      parseTimeToMinutes(last.endTime) ??
      (lastStart != null ? lastStart + last.minutes : null);
    if (lastEnd != null) {
      const lunchEnd = lastEnd + LUNCH_MINUTES;
      if (lunchEnd > lastEnd) {
        lunchFound = true;
        gaps.push({
          type: 'lunch',
          fromTime: formatMinutesAsTime(lastEnd),
          toTime: formatMinutesAsTime(lunchEnd),
          gapMinutes: lunchEnd - lastEnd,
          label: `Almoço (${formatMinutesAsTime(LUNCH_MINUTES)})`,
        });
      }
    }
  }

  // Gap final: se ainda não completou 8h (HORA NORMAL) no dia, cria um aviso de "faltou apontar".
  // - Se for hoje: mede até agora.
  // - Se for dia passado: mede até o ponto "virtual" onde completaria 8h se continuasse sem pausas.
  if (regularEntries.length > 0) {
    const last = regularEntries[regularEntries.length - 1];
    const lastStart = parseTimeToMinutes(last.initTime);
    const lastEnd =
      parseTimeToMinutes(last.endTime) ??
      (lastStart != null ? lastStart + last.minutes : null);

    if (lastEnd != null && regularWorkedMinutes < REGULAR_DAY_MINUTES) {
      const nowLimit = dayIsToday ? new Date() : null;
      const limit = dayIsToday
        ? nowLimit!.getHours() * 60 + nowLimit!.getMinutes()
        : lastEnd + (REGULAR_DAY_MINUTES - regularWorkedMinutes);

      // Se criamos almoço fixo, o gap final deve começar depois dele.
      const lastLunch = [...gaps]
        .filter((g) => g.type === 'lunch')
        .map((g) => parseTimeToMinutes(g.toTime))
        .filter((m): m is number => m != null)
        .sort((a, b) => b - a)[0];
      const tailFrom = Math.max(lastEnd, lastLunch ?? lastEnd);

      if (limit > tailFrom) {
        addIdleGap(gaps, tailFrom, limit);
      }
    }
  }

  const totalMinutes = enriched.reduce((sum, e) => sum + e.minutes, 0);
  const overtimeMinutes = enriched
    .filter((e) => e.isOvertime)
    .reduce((sum, e) => sum + e.minutes, 0);
  const hasIdleGapAlert = gaps.some((g) => g.type === 'idle');

  return {
    entries: enriched,
    insights: {
      // "Regular" é só jornada normal (não inclui HE) e deve refletir o total real do dia.
      regularMinutes: regularWorkedMinutes,
      overtimeMinutes,
      hasOvertime: enriched.some((e) => e.isOvertime),
      hasIdleGapAlert,
      hasExpectedLunch: lunchFound,
      gaps,
    },
  };
}
