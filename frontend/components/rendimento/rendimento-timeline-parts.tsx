"use client";

import { cn } from "@/lib/utils";
import { resolveRendimentoOvertimeDisplay } from "@/lib/rendimento/entry-overtime";
import {
  buildTimelineMarks,
  formatTimelineMark,
  intervalMinutes,
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

export function RendimentoTimelineTrack({
  blocks,
  range: rangeProp,
  height = 56,
  compact = false,
  className,
}: TimelineTrackProps) {
  const range = rangeProp ?? resolveTimelineRange(blocks);
  const hourMarks = buildTimelineMarks(range);

  return (
    <div className={cn("space-y-1", className)}>
      <div
        className="relative rounded-md border border-border bg-muted/30"
        style={{ height }}
      >
        {blocks.length === 0 ? (
          <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
            sem registro
          </span>
        ) : (
          [...blocks]
            .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
            .map((block, index) => {
              const left =
                ((block.startMin - range.startMin) / range.spanMin) * 100;
              const width =
                ((block.endMin - block.startMin) / range.spanMin) * 100;
              const minWidth =
                block.tone === "gap" ? (compact ? 3 : 2) : compact ? 1.5 : 1;

              return (
                <div
                  key={`${block.tone}-${block.startMin}-${index}`}
                  title={[block.label, block.sub].filter(Boolean).join(" · ")}
                  className={cn(
                    "absolute overflow-hidden rounded border px-1.5 py-0.5",
                    timelineBlockClass(block.tone),
                    compact ? "top-1 bottom-1" : "top-1.5 bottom-1.5",
                    block.tone === "gap" && "z-10",
                  )}
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, minWidth)}%`,
                  }}
                >
                  {!compact ? (
                    <>
                      <p className="truncate text-[10px] font-semibold text-white">
                        {block.label}
                      </p>
                      {block.sub ? (
                        <p className="truncate text-[9px] text-white/85">
                          {block.sub}
                        </p>
                      ) : null}
                    </>
                  ) : null}
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
