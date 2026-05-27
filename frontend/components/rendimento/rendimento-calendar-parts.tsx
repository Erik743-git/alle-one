"use client";

import { AlertTriangle, CheckCircle2, Coffee, Clock, Hourglass, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  RendimentoDaySummary,
  RendimentoEntry,
  RendimentoGap,
} from "@/lib/services/rendimento.service";

export function RendimentoLegend() {
  return (
    <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <span className="font-semibold text-foreground">Legenda:</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-amber-500" />
        Hora extra
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-orange-500" />
        <AlertTriangle className="size-3 text-orange-500" />
        &gt; 1h sem apontar
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Coffee className="size-3 text-emerald-600" />
        Almoço (perdoa 1 alerta/dia)
      </span>
    </div>
  );
}

export function RendimentoDayIndicators({
  summary,
  compact = false,
}: {
  summary?: RendimentoDaySummary;
  compact?: boolean;
}) {
  if (!summary?.insights) return null;
  const { insights } = summary;

  return (
    <div className={cn("flex flex-wrap gap-1", compact ? "mt-1" : "mt-2")}>
      {insights.hasOvertime ? (
        <span
          className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-300"
          title="Hora extra no dia"
        >
          <Clock className="size-2.5" />
          HE
        </span>
      ) : null}
      {insights.hasIdleGapAlert ? (
        <span
          className="inline-flex items-center gap-0.5 rounded bg-orange-500/20 px-1 py-0.5 text-[9px] font-bold text-orange-700 dark:text-orange-300"
          title="Intervalo sem apontamento (> 1h)"
        >
          <AlertTriangle className="size-2.5" />
          !
        </span>
      ) : null}
      {insights.hasExpectedLunch ? (
        <span
          className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] font-bold text-emerald-700 dark:text-emerald-300"
          title="Almoço identificado"
        >
          <Coffee className="size-2.5" />
        </span>
      ) : null}
    </div>
  );
}

export function RendimentoGapBlock({
  gap,
  onJustify,
  canApprove,
  onApprove,
  onReject,
}: {
  gap: RendimentoGap;
  onJustify?: () => void;
  canApprove?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const isLunch = gap.type === "lunch";
  const justification = gap.justification;
  const justificationPending = justification?.status === "PENDING";
  const justificationApproved = justification?.status === "APPROVED";
  const justificationRejected = justification?.status === "REJECTED";
  return (
    <li
      className={cn(
        "rounded-md border px-2 py-1.5 text-[10px] font-medium space-y-1",
        justificationApproved
          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
          : justificationPending
            ? "border-sky-500/40 bg-sky-500/15 text-sky-800 dark:text-sky-200"
            : justificationRejected
              ? "border-rose-500/45 bg-rose-500/15 text-rose-800 dark:text-rose-200"
              : isLunch
                ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                : "border-orange-500/40 bg-orange-500/15 text-orange-800 dark:text-orange-200",
      )}
    >
      <div>
        {isLunch ? (
          <Coffee className="mb-0.5 inline size-3" />
        ) : (
          <AlertTriangle className="mb-0.5 inline size-3" />
        )}{" "}
        {gap.fromTime} – {gap.toTime}: {gap.label}
      </div>
      {justification ? (
        <div className="flex items-center gap-1">
          {justificationPending ? <Hourglass className="size-3" /> : null}
          {justificationApproved ? <CheckCircle2 className="size-3" /> : null}
          {justificationRejected ? <XCircle className="size-3" /> : null}
          <span>
            {justification.status === "PENDING"
              ? "Justificativa pendente"
              : justification.status === "APPROVED"
                ? "Justificativa aprovada"
                : "Justificativa rejeitada"}
          </span>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {onJustify ? (
          <button
            type="button"
            className="rounded bg-background/70 px-2 py-0.5 text-[10px] font-bold text-foreground hover:bg-background"
            onClick={onJustify}
          >
            Justificar
          </button>
        ) : null}
        {canApprove && justificationPending && onApprove ? (
          <button
            type="button"
            className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-500"
            onClick={onApprove}
          >
            Aprovar
          </button>
        ) : null}
        {canApprove && justificationPending && onReject ? (
          <button
            type="button"
            className="rounded bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-rose-500"
            onClick={onReject}
          >
            Rejeitar
          </button>
        ) : null}
      </div>
    </li>
  );
}

export function RendimentoEntryCard({
  entry,
  dense = false,
}: {
  entry: RendimentoEntry;
  dense?: boolean;
}) {
  return (
    <li
      className={cn(
        "rounded-md border px-2 py-1 text-[10px]",
        entry.isOvertime
          ? "border-amber-500/50 bg-amber-500/15 text-foreground"
          : "border-primary/20 bg-primary/10 text-foreground",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-semibold">
          {entry.initTime?.slice(0, 5) ?? "—"}
          {entry.isOvertime ? (
            <span className="ml-1 rounded bg-amber-600 px-1 text-[8px] font-bold text-white">
              HE
            </span>
          ) : null}
        </span>
        <span className="font-bold">{entry.hoursFormatted}</span>
      </div>
      <p className={cn("truncate text-muted-foreground", dense && "text-[9px]")}>
        #{entry.ticketNumber}
        {entry.clientName ? ` · ${entry.clientName}` : ""}
      </p>
    </li>
  );
}

function sortEntriesByStart(entries: RendimentoEntry[]) {
  return [...entries].sort((a, b) => {
    const am = a.initTime?.slice(0, 5) ?? "00:00";
    const bm = b.initTime?.slice(0, 5) ?? "00:00";
    return am.localeCompare(bm);
  });
}

/** Apontamentos e intervalos (alertas / almoço) na ordem do dia. */
export function buildDayTimeline(summary: RendimentoDaySummary) {
  type TimelineItem =
    | { kind: "entry"; entry: RendimentoEntry }
    | { kind: "gap"; gap: RendimentoGap };

  const entries = sortEntriesByStart(summary.entries);
  const gaps = summary.insights?.gaps ?? [];
  const items: TimelineItem[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    items.push({ kind: "entry", entry: entries[index] });
    if (index < entries.length - 1) {
      const fromTime = entries[index].endTime?.slice(0, 5);
      const toTime = entries[index + 1].initTime?.slice(0, 5);
      const gap = gaps.find(
        (g) => g.fromTime === fromTime && g.toTime === toTime,
      );
      if (gap) {
        items.push({ kind: "gap", gap });
      }
    }
  }

  return items;
}
