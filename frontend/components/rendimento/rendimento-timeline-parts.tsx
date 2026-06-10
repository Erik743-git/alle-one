"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { resolveRendimentoOvertimeDisplay } from "@/lib/rendimento/entry-overtime";
import {
  assignTimelineColumns,
  buildTimelineMarks,
  formatTimelineMark,
  intervalMinutes,
  layoutTimelineBlockRect,
  resolveTimelineRange,
  workdayFillPercent,
  type TimelineBlock,
  type TimelineBlockTone,
  type TimelineRange,
} from "@/lib/rendimento/timeline";
import type {
  RendimentoDaySummary,
  RendimentoEntry,
  RendimentoGap,
  RendimentoVoluntaryJustification,
} from "@/lib/services/rendimento.service";
import { buildDayTimeline } from "@/components/rendimento/rendimento-calendar-parts";

export {
  DEFAULT_TIMELINE_START_MIN,
  DEFAULT_TIMELINE_END_MIN,
  TIMELINE_EDGE_PADDING_MIN,
  resolveTimelineRange,
  workdayFillPercent,
  type TimelineBlock,
  type TimelineBlockTone,
  type TimelineRange,
} from "@/lib/rendimento/timeline";

export function buildTimelineBlocks(
  summary: RendimentoDaySummary,
  options?: { appointmentsOnly?: boolean },
): TimelineBlock[] {
  const items = buildDayTimeline(summary, options);

  return items
    .map((item): TimelineBlock | null => {
      if (item.kind === "entry") {
        const entry = item.entry;
        const interval = intervalMinutes(entry.initTime, entry.endTime);
        if (!interval) return null;

        const overtime = resolveRendimentoOvertimeDisplay(entry);
        const tone: TimelineBlockTone =
          overtime.kind === "PLANTAO"
            ? "plantao"
            : overtime.kind === "EXTRA"
              ? "overtime"
              : "work";

        return {
          startMin: interval.startMin,
          endMin: interval.endMin,
          label: `#${entry.ticketNumber}${entry.clientName ? ` · ${entry.clientName}` : ""}`,
          sub: entry.description?.trim() || undefined,
          tone,
        };
      }

      if (item.kind === "gap") {
        const gap = item.gap;
        const interval = intervalMinutes(gap.fromTime, gap.toTime);
        if (!interval) return null;

        return {
          startMin: interval.startMin,
          endMin: interval.endMin,
          label: gap.label,
          sub: `${gap.gapMinutes} min`,
          tone: gap.type === "lunch" ? "lunch" : "gap",
        };
      }

      const voluntary = item.voluntary;
      const interval = intervalMinutes(voluntary.fromTime, voluntary.toTime);
      if (!interval) return null;

      return {
        startMin: interval.startMin,
        endMin: interval.endMin,
        label: "Justificativa voluntária",
        sub: voluntary.reason.trim() || undefined,
        tone: "voluntary",
      };
    })
    .filter((block): block is TimelineBlock => block != null);
}

export function timelineBlockClass(tone: TimelineBlockTone): string {
  switch (tone) {
    case "overtime":
      return "bg-amber-500/85 border-amber-600/40";
    case "plantao":
      return "bg-violet-500/85 border-violet-600/40";
    case "lunch":
      return "bg-emerald-500/80 border-emerald-600/40";
    case "gap":
      return "bg-orange-500/80 border-orange-600/40";
    case "voluntary":
      return "bg-sky-500/75 border-sky-600/40";
    default:
      return "bg-primary/80 border-primary/50";
  }
}

export function timelineBarFillClass(
  summary: RendimentoDaySummary | undefined,
  hasGapAlert: boolean,
): string {
  if (hasGapAlert) return "bg-orange-500";
  if ((summary?.totalMinutes ?? 0) > 0) return "bg-primary";
  return "bg-muted-foreground/30";
}

type TimelineTrackProps = {
  blocks: TimelineBlock[];
  range?: TimelineRange;
  height?: number;
  compact?: boolean;
  className?: string;
};

const TIMELINE_BAR_HEIGHT = {
  default: 44,
  compact: 28,
} as const;

export function RendimentoTimelineTrack({
  blocks,
  range: rangeProp,
  height,
  compact = false,
  className,
}: TimelineTrackProps) {
  const range = rangeProp ?? resolveTimelineRange(blocks);
  const hourMarks = buildTimelineMarks(range);
  const { items } = assignTimelineColumns(blocks);
  const barHeight = compact
    ? TIMELINE_BAR_HEIGHT.compact
    : TIMELINE_BAR_HEIGHT.default;
  const trackHeight = height ?? barHeight + (compact ? 8 : 12);
  const [activeBarKey, setActiveBarKey] = React.useState<string | null>(null);
  const leaveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const activateBar = React.useCallback(
    (barKey: string) => {
      if (compact) return;
      if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current);
        leaveTimeoutRef.current = null;
      }
      setActiveBarKey(barKey);
    },
    [compact],
  );

  const deactivateBar = React.useCallback(() => {
    if (compact) return;
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
    }
    leaveTimeoutRef.current = setTimeout(() => {
      setActiveBarKey(null);
      leaveTimeoutRef.current = null;
    }, 120);
  }, [compact]);

  React.useEffect(
    () => () => {
      if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current);
      }
    },
    [],
  );

  return (
    <div className={cn("space-y-1", className)}>
      <div
        className="relative isolate overflow-visible rounded-md border border-border bg-muted/30"
        style={{ height: trackHeight }}
      >
        {blocks.length === 0 ? (
          <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
            sem registro
          </span>
        ) : (
          items.map(({ block, column, columns }, index) => {
            const { leftPct, widthPct } = layoutTimelineBlockRect(
              block,
              range,
              column,
              columns,
            );
            const barKey = `${block.tone}-${block.startMin}-${column}-${index}`;
            const isActive = activeBarKey === barKey;
            const isNarrow = widthPct < 7;

            return (
              <div
                key={barKey}
                className="pointer-events-none absolute bottom-1.5"
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  height: barHeight,
                  zIndex: isActive ? 100 : activeBarKey ? 1 : column + 1,
                }}
              >
                <div
                  title={[block.label, block.sub].filter(Boolean).join(" · ")}
                  onMouseEnter={() => activateBar(barKey)}
                  onMouseLeave={deactivateBar}
                  className={cn(
                    "absolute bottom-0 left-0 overflow-hidden rounded-md border",
                    "transition-[height,box-shadow] duration-200 ease-out",
                    isActive
                      ? "z-[100] h-auto min-h-[5rem] overflow-visible shadow-lg ring-1 ring-white/25"
                      : "h-full w-full",
                    isActive && isNarrow && "min-w-[10.5rem] max-w-[16rem]",
                    isActive && !isNarrow && "w-full",
                    timelineBlockClass(block.tone),
                    compact ? "pointer-events-none" : "pointer-events-auto",
                  )}
                >
                  {!compact ? (
                    <div
                      className={cn(
                        "flex h-full min-h-[inherit] flex-col justify-end px-2 pb-1.5 transition-opacity duration-200",
                        isActive ? "opacity-100" : "opacity-0",
                      )}
                    >
                      <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-white">
                        {block.label}
                      </p>
                      {block.sub ? (
                        <p className="mt-0.5 line-clamp-4 text-[10px] leading-snug text-white/90">
                          {block.sub}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex justify-between px-0.5">
        {hourMarks.map((mark) => (
          <span key={mark} className="text-[10px] text-muted-foreground">
            {formatTimelineMark(mark)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RendimentoTimelineLegend({
  simplified = false,
}: {
  simplified?: boolean;
}) {
  const items: { className: string; label: string }[] = [
    { className: "bg-primary/80", label: "Hora normal" },
    { className: "bg-amber-500 ring-1 ring-amber-400/60", label: "Hora extra" },
    { className: "bg-violet-500/85", label: "Plantão" },
  ];

  if (!simplified) {
    items.push(
      { className: "bg-emerald-500/80", label: "Almoço" },
      { className: "bg-orange-500/80", label: "Sem registro" },
      { className: "bg-sky-500/75", label: "Justificativa voluntária" },
    );
  }

  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-sm", item.className)} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export type { RendimentoEntry, RendimentoGap, RendimentoVoluntaryJustification };
