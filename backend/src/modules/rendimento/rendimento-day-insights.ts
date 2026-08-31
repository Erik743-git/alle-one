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

export type RendimentoDaySchedule = {
  dailyWorkMinutes: number;
  lunchMinutes: number;
};

export const DEFAULT_RENDIMENTO_DAY_SCHEDULE: RendimentoDaySchedule = {
  dailyWorkMinutes: REGULAR_DAY_MINUTES,
  lunchMinutes: LUNCH_MINUTES,
};

function resolveDaySchedule(
  schedule?: RendimentoDaySchedule,
): RendimentoDaySchedule {
  return schedule ?? DEFAULT_RENDIMENTO_DAY_SCHEDULE;
}

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

type TimeInterval = { from: number; to: number };

function entryToInterval(entry: RendimentoEntryInput): TimeInterval | null {
  const from = parseTimeToMinutes(entry.initTime);
  if (from == null) return null;

  const duration = Math.max(0, Math.trunc(Number(entry.minutes) || 0));
  let to = parseTimeToMinutes(entry.endTime);
  if (to == null) {
    if (duration <= 0) return null;
    return { from, to: from + duration };
  }
  if (to <= from) {
    to += duration > 0 ? duration : MINUTES_PER_DAY;
  }
  if (to <= from) return null;
  return { from, to };
}

/** Une apontamentos sobrepostos para calcular lacunas e minutos reais do dia. */
function mergeOverlappingIntervals(intervals: TimeInterval[]): TimeInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: TimeInterval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.from <= last.to) {
      last.to = Math.max(last.to, current.to);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

function mergedRegularWorkedMinutes(intervals: TimeInterval[]): number {
  return mergeOverlappingIntervals(intervals).reduce(
    (sum, interval) => sum + (interval.to - interval.from),
    0,
  );
}

function pickLunchGap(gaps: RendimentoGapDto[], lunchMinutes: number) {
  // Regra de negócio: por dia, "perdoa" 1 alerta transformando o gap mais próximo do almoço esperado.
  const candidates = gaps.filter(
    (gap) => gap.type === 'idle' && gap.gapMinutes > GAP_ALERT_MINUTES,
  );

  return candidates.sort((a, b) => {
    const diffA = Math.abs(a.gapMinutes - lunchMinutes);
    const diffB = Math.abs(b.gapMinutes - lunchMinutes);
    if (diffA !== diffB) return diffA - diffB;
    // Empate: prefere o maior gap (mais provável de ser almoço de verdade).
    if (a.gapMinutes !== b.gapMinutes) return b.gapMinutes - a.gapMinutes;
    return a.fromTime.localeCompare(b.fromTime);
  })[0];
}

/** Divide um gap longo em almoço + alerta com o restante. */
function splitGapAtIndexIntoLunchAndIdle(
  gaps: RendimentoGapDto[],
  idx: number,
  lunchMinutes: number,
  scheduleEndMinutes: number | null,
): boolean {
  const gap = gaps[idx];
  const from = parseTimeToMinutes(gap.fromTime);
  const to = parseTimeToMinutes(gap.toTime);
  if (from == null || to == null) return false;
  if (to - from < lunchMinutes) return false;

  const lunchEnd = from + lunchMinutes;
  const lunch: RendimentoGapDto = {
    type: 'lunch',
    fromTime: formatMinutesAsTime(from),
    toTime: formatMinutesAsTime(lunchEnd),
    gapMinutes: lunchMinutes,
    label: `Almoço (${formatMinutesAsTime(lunchMinutes)})`,
  };

  const remainingMinutes = to - lunchEnd;
  const next: RendimentoGapDto[] = [];
  for (let i = 0; i < gaps.length; i += 1) {
    if (i !== idx) {
      next.push(gaps[i]);
      continue;
    }
    next.push(lunch);
    if (remainingMinutes > GAP_ALERT_MINUTES) {
      addIdleGap(next, lunchEnd, to, scheduleEndMinutes);
    }
  }

  gaps.splice(0, gaps.length, ...next);
  return true;
}

function splitFirstLongIdleGapIntoLunch(
  gaps: RendimentoGapDto[],
  lunchMinutes: number,
  scheduleEndMinutes: number | null,
): boolean {
  const idx = gaps.findIndex(
    (g) => g.type === 'idle' && g.gapMinutes >= lunchMinutes,
  );
  if (idx < 0) return false;
  return splitGapAtIndexIntoLunchAndIdle(
    gaps,
    idx,
    lunchMinutes,
    scheduleEndMinutes,
  );
}

function addIdleGap(
  gaps: RendimentoGapDto[],
  fromMinutes: number,
  toMinutes: number,
  scheduleEndMinutes: number | null,
) {
  if (scheduleEndMinutes != null) {
    if (fromMinutes >= scheduleEndMinutes) return;
    toMinutes = Math.min(toMinutes, scheduleEndMinutes);
  }
  const gapMinutes = toMinutes - fromMinutes;
  if (gapMinutes > GAP_ALERT_MINUTES) {
    gaps.push({
      type: 'idle',
      fromTime: formatMinutesAsTime(fromMinutes),
      toTime: formatMinutesAsTime(toMinutes),
      gapMinutes,
      label: `${gapMinutes} min sem registro de horas`,
    });
  }
}

/** Dia civil atual (fuso local) — alertas de lacuna/almoço só valem até ontem. */
export function isRendimentoDateToday(dateIsoLike: string): boolean {
  const raw = String(dateIsoLike).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const now = new Date();
  return (
    now.getFullYear() === y && now.getMonth() === mo && now.getDate() === d
  );
}

function isToday(dateIsoLike: string): boolean {
  return isRendimentoDateToday(dateIsoLike);
}

export function analyzeRendimentoDay(
  entries: RendimentoEntryInput[],
  valorizationById?: Map<number, unknown>,
  schedule?: RendimentoDaySchedule,
): {
  entries: RendimentoEntryEnriched[];
  insights: RendimentoDayInsightsDto;
} {
  const daySchedule = resolveDaySchedule(schedule);
  const dailyWorkMinutes = daySchedule.dailyWorkMinutes;
  const lunchMinutes = daySchedule.lunchMinutes;
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
    firstRegularIdx >= 0
      ? enriched.slice(firstRegularIdx).filter((e) => !e.isOvertime)
      : [];
  const regularIntervals = regularEntries
    .map(entryToInterval)
    .filter((interval): interval is TimeInterval => interval != null);
  const mergedRegularIntervals = mergeOverlappingIntervals(regularIntervals);
  const regularWorkedMinutes = mergedRegularWorkedMinutes(regularIntervals);
  const firstRegularStartMinutes =
    regularEntries.length > 0
      ? parseTimeToMinutes(regularEntries[0].initTime)
      : null;
  const scheduleEndMinutes =
    firstRegularStartMinutes != null
      ? firstRegularStartMinutes + dailyWorkMinutes + lunchMinutes
      : null;
  const overtimeMinutes = enriched
    .filter((e) => e.isOvertime)
    .reduce((sum, e) => sum + e.minutes, 0);

  // Expediente em andamento: não gera lacuna/almoço até o dia fechar (D+1).
  if (dayIsToday) {
    return {
      entries: enriched,
      insights: {
        regularMinutes: regularWorkedMinutes,
        overtimeMinutes,
        hasOvertime: enriched.some((e) => e.isOvertime),
        hasIdleGapAlert: false,
        hasExpectedLunch: false,
        gaps: [],
      },
    };
  }

  // Lacunas entre blocos cobertos (apontamentos sobrepostos viram um único intervalo).
  for (let index = 0; index < mergedRegularIntervals.length; index += 1) {
    const interval = mergedRegularIntervals[index];
    if (index > 0) {
      addIdleGap(
        gaps,
        mergedRegularIntervals[index - 1].to,
        interval.from,
        scheduleEndMinutes,
      );
    }
  }

  // Se existir um gap compatível, ele vira almoço.
  // Caso não exista e o dia só tenha 1 apontamento, criamos um almoço fixo
  // a partir do fim do apontamento (quando couber dentro do expediente).
  const lunchCandidate = pickLunchGap(gaps, lunchMinutes);
  if (lunchCandidate) {
    lunchFound = true;
    const lunchIdx = gaps.indexOf(lunchCandidate);
    if (lunchIdx >= 0 && lunchCandidate.gapMinutes > lunchMinutes) {
      splitGapAtIndexIntoLunchAndIdle(
        gaps,
        lunchIdx,
        lunchMinutes,
        scheduleEndMinutes,
      );
    } else {
      lunchCandidate.type = 'lunch';
      lunchCandidate.label = `Almoço (${formatMinutesAsTime(lunchMinutes)})`;
    }
  } else if (
    splitFirstLongIdleGapIntoLunch(gaps, lunchMinutes, scheduleEndMinutes)
  ) {
    lunchFound = true;
  } else if (mergedRegularIntervals.length === 1) {
    const lastEnd = mergedRegularIntervals[0].to;
    const lunchEnd = lastEnd + lunchMinutes;
    if (lunchEnd > lastEnd) {
      lunchFound = true;
      gaps.push({
        type: 'lunch',
        fromTime: formatMinutesAsTime(lastEnd),
        toTime: formatMinutesAsTime(lunchEnd),
        gapMinutes: lunchEnd - lastEnd,
        label: `Almoço (${formatMinutesAsTime(lunchMinutes)})`,
      });
    }
  }

  // Gap final: se ainda não completou a jornada normal no dia, cria aviso de "faltou apontar".
  if (mergedRegularIntervals.length > 0) {
    const lastEnd = Math.max(
      ...mergedRegularIntervals.map((interval) => interval.to),
    );

    if (regularWorkedMinutes < dailyWorkMinutes) {
      const minutesStillNeeded = dailyWorkMinutes - regularWorkedMinutes;

      const lastLunch = [...gaps]
        .filter((g) => g.type === 'lunch')
        .map((g) => parseTimeToMinutes(g.toTime))
        .filter((m): m is number => m != null)
        .sort((a, b) => b - a)[0];
      const tailFrom = Math.max(lastEnd, lastLunch ?? lastEnd);
      const virtualCompleteEnd = tailFrom + minutesStillNeeded;

      const nowMinutes = dayIsToday
        ? new Date().getHours() * 60 + new Date().getMinutes()
        : null;
      let limit =
        dayIsToday && nowMinutes != null
          ? Math.min(nowMinutes, virtualCompleteEnd)
          : virtualCompleteEnd;

      if (scheduleEndMinutes != null) {
        limit = Math.min(limit, scheduleEndMinutes);
      }

      if (limit > tailFrom) {
        addIdleGap(gaps, tailFrom, limit, scheduleEndMinutes);
      }
    }
  }

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
