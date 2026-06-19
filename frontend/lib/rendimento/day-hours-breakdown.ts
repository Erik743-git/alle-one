import type { RendimentoDaySummary } from "@/lib/services/rendimento.service";
import { resolveRendimentoOvertimeDisplay } from "@/lib/rendimento/entry-overtime";

export type RendimentoDayHoursBreakdown = {
  normalMinutes: number;
  extraMinutes: number;
  plantaoMinutes: number;
  justificationPendingMinutes: number;
  justificationApprovedMinutes: number;
};

const EMPTY_BREAKDOWN: RendimentoDayHoursBreakdown = {
  normalMinutes: 0,
  extraMinutes: 0,
  plantaoMinutes: 0,
  justificationPendingMinutes: 0,
  justificationApprovedMinutes: 0,
};

export function formatBreakdownMinutes(minutes: number): string {
  const safe = Math.max(0, Math.trunc(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function computeDayHoursBreakdown(
  summary?: RendimentoDaySummary | null,
): RendimentoDayHoursBreakdown {
  if (!summary) return { ...EMPTY_BREAKDOWN };

  let normalMinutes = 0;
  let extraMinutes = 0;
  let plantaoMinutes = 0;

  for (const entry of summary.entries) {
    const minutes = Math.max(0, Math.trunc(entry.minutes));
    const kind = resolveRendimentoOvertimeDisplay(entry).kind;
    if (kind === "EXTRA") {
      extraMinutes += minutes;
    } else if (kind === "PLANTAO") {
      plantaoMinutes += minutes;
    } else {
      normalMinutes += minutes;
    }
  }

  let justificationPendingMinutes = 0;
  let justificationApprovedMinutes = 0;

  for (const gap of summary.insights?.gaps ?? []) {
    const justification = gap.justification;
    if (!justification || justification.kind === "VOLUNTARY") continue;
    if (justification.status === "PENDING") {
      justificationPendingMinutes += Math.max(0, gap.gapMinutes);
    } else if (justification.status === "APPROVED") {
      justificationApprovedMinutes += Math.max(0, gap.gapMinutes);
    }
  }

  for (const justification of summary.voluntaryJustifications ?? []) {
    const minutes = Math.max(0, Math.trunc(justification.gapMinutes));
    if (justification.status === "PENDING") {
      justificationPendingMinutes += minutes;
    } else if (justification.status === "APPROVED") {
      justificationApprovedMinutes += minutes;
    }
  }

  return {
    normalMinutes,
    extraMinutes,
    plantaoMinutes,
    justificationPendingMinutes,
    justificationApprovedMinutes,
  };
}

export function breakdownHasVisibleLines(
  breakdown: RendimentoDayHoursBreakdown,
): boolean {
  return (
    breakdown.normalMinutes > 0 ||
    breakdown.extraMinutes > 0 ||
    breakdown.plantaoMinutes > 0 ||
    breakdown.justificationPendingMinutes > 0 ||
    breakdown.justificationApprovedMinutes > 0
  );
}
