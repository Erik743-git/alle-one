"use client";

import { cn } from "@/lib/utils";
import type { RendimentoDaySummary } from "@/lib/services/rendimento.service";
import {
  breakdownHasVisibleLines,
  computeDayHoursBreakdown,
  formatBreakdownMinutes,
} from "@/lib/rendimento/day-hours-breakdown";

type RendimentoDayHoursBreakdownProps = {
  summary?: RendimentoDaySummary;
  compact?: boolean;
  showTotal?: boolean;
  className?: string;
};

export function RendimentoDayHoursBreakdown({
  summary,
  compact = false,
  showTotal = false,
  className,
}: RendimentoDayHoursBreakdownProps) {
  const breakdown = computeDayHoursBreakdown(summary);

  if (!breakdownHasVisibleLines(breakdown)) {
    return null;
  }

  const lines = [
    {
      key: "normal",
      label: "Normal",
      minutes: breakdown.normalMinutes,
      className: "text-foreground",
    },
    {
      key: "extra",
      label: "HE",
      minutes: breakdown.extraMinutes,
      className: "alle-stat-overtime",
    },
    {
      key: "plantao",
      label: "Plantão",
      minutes: breakdown.plantaoMinutes,
      className: "text-violet-700 dark:text-violet-300",
    },
    {
      key: "just-pending",
      label: "Just. pend.",
      minutes: breakdown.justificationPendingMinutes,
      className: "text-sky-700 dark:text-sky-300",
    },
    {
      key: "just-approved",
      label: "Just. aprov.",
      minutes: breakdown.justificationApprovedMinutes,
      className: "text-emerald-700 dark:text-emerald-300",
    },
  ].filter((line) => line.minutes > 0);

  return (
    <div
      className={cn(
        "space-y-0.5",
        compact ? "text-[9px] leading-tight" : "text-xs",
        className,
      )}
    >
      {showTotal && summary && summary.totalMinutes > 0 ? (
        <div className="flex items-center justify-between gap-1 font-bold text-foreground">
          <span>Total</span>
          <span>{summary.totalHoursFormatted}</span>
        </div>
      ) : null}
      {lines.map((line) => (
        <div
          key={line.key}
          className={cn(
            "flex items-center justify-between gap-1 font-semibold",
            line.className,
          )}
        >
          <span className="truncate">{line.label}</span>
          <span className="shrink-0 tabular-nums">
            {formatBreakdownMinutes(line.minutes)}
          </span>
        </div>
      ))}
    </div>
  );
}
