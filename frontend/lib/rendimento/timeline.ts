export const DEFAULT_TIMELINE_START_MIN = 8 * 60;
export const DEFAULT_TIMELINE_END_MIN = 20 * 60;
const WORKDAY_TARGET_MINUTES = 8 * 60;
const MINUTES_PER_DAY = 24 * 60;
export const TIMELINE_EDGE_PADDING_MIN = 60;

export type TimelineBlockTone =
  | "work"
  | "overtime"
  | "plantao"
  | "lunch"
  | "gap"
  | "voluntary";

export type TimelineBlock = {
  startMin: number;
  endMin: number;
  label: string;
  sub?: string;
  tone: TimelineBlockTone;
};

export type TimelineRange = {
  startMin: number;
  endMin: number;
  spanMin: number;
};

function timeToMinutes(value: string | null | undefined): number {
  if (!value?.trim()) return 0;
  const [h, m] = value.split(":").map((part) => Number(part.trim()));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

/** Intervalo no eixo do dia; se o fim “volta” (ex. 20:00→00:30), trata como dia seguinte. */
export function intervalMinutes(
  fromTime: string | null | undefined,
  toTime: string | null | undefined,
): { startMin: number; endMin: number } | null {
  const startMin = timeToMinutes(fromTime);
  let endMin = timeToMinutes(toTime);
  if (endMin <= startMin) {
    endMin += MINUTES_PER_DAY;
  }
  if (endMin <= startMin) return null;
  return { startMin, endMin };
}

export function resolveTimelineRange(blocks: TimelineBlock[]): TimelineRange {
  const valid = blocks.filter((block) => block.endMin > block.startMin);

  if (valid.length === 0) {
    return {
      startMin: DEFAULT_TIMELINE_START_MIN,
      endMin: DEFAULT_TIMELINE_END_MIN,
      spanMin: DEFAULT_TIMELINE_END_MIN - DEFAULT_TIMELINE_START_MIN,
    };
  }

  const contentStart = Math.min(...valid.map((block) => block.startMin));
  const contentEnd = Math.max(...valid.map((block) => block.endMin));
  const startMin = Math.max(0, contentStart - TIMELINE_EDGE_PADDING_MIN);
  const endMin = contentEnd + TIMELINE_EDGE_PADDING_MIN;

  return {
    startMin,
    endMin,
    spanMin: Math.max(endMin - startMin, 1),
  };
}

export function formatTimelineMark(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0 && hours <= 24) {
    return `${String(hours).padStart(2, "0")}h`;
  }
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function buildTimelineMarks(range: TimelineRange): number[] {
  const { startMin, endMin, spanMin } = range;
  const step =
    spanMin <= 3 * 60 ? 30 : spanMin <= 6 * 60 ? 60 : spanMin <= 10 * 60 ? 60 : 120;

  const marks: number[] = [startMin];
  let cursor = Math.ceil(startMin / step) * step;
  if (cursor <= startMin) {
    cursor += step;
  }

  while (cursor < endMin) {
    marks.push(cursor);
    cursor += step;
  }

  if (marks[marks.length - 1] !== endMin) {
    marks.push(endMin);
  }

  return marks;
}

export function workdayFillPercent(totalMinutes: number): number {
  if (totalMinutes <= 0) return 0;
  return Math.min(100, Math.round((totalMinutes / WORKDAY_TARGET_MINUTES) * 100));
}
