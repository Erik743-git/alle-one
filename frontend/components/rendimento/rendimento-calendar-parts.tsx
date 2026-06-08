"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Coffee,
  Clock,
  FileText,
  Hourglass,
  XCircle,
} from "lucide-react";

import { RendimentoOvertimeBadge } from "@/components/rendimento/rendimento-overtime-badge";
import {
  rendimentoOvertimeCardClass,
  resolveRendimentoOvertimeDisplay,
} from "@/lib/rendimento/entry-overtime";
import { cn } from "@/lib/utils";
import type {
  RendimentoDaySummary,
  RendimentoEntry,
  RendimentoGap,
  RendimentoVoluntaryJustification,
} from "@/lib/services/rendimento.service";

export function RendimentoLegend() {
  return (
    <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <span className="font-semibold text-foreground">Legenda:</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-amber-500" />
        Hora extra (do dia 26 ao dia 25)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-violet-600" />
        Plantão
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
  showLunch = true,
}: {
  summary?: RendimentoDaySummary;
  compact?: boolean;
  /** Visão mensal: ocultar ícone de almoço nas células do calendário. */
  showLunch?: boolean;
}) {
  const insights = dayInsightsForDisplay(summary);
  if (!insights) return null;

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
      {showLunch && insights.hasExpectedLunch ? (
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
        <div className="space-y-1">
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
          {justification.reason.trim() ? (
            <p className="whitespace-pre-wrap text-[10px] leading-snug text-foreground/90">
              {justification.reason.trim()}
            </p>
          ) : null}
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
  const overtime = resolveRendimentoOvertimeDisplay(entry);
  return (
    <li
      className={cn(
        "rounded-md border px-2 py-1 text-[10px]",
        overtime.kind
          ? rendimentoOvertimeCardClass(overtime.kind)
          : "border-primary/20 bg-primary/10 text-foreground",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-semibold">
          {entry.initTime?.slice(0, 5) ?? "—"}
          <RendimentoOvertimeBadge entry={entry} size="sm" />
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

/** Aviso pontual — independente do alerta de lacuna (sem apontamento). */
export function RendimentoVoluntaryJustificationBlock({
  item,
  canApprove,
  onApprove,
  onReject,
}: {
  item: RendimentoVoluntaryJustification;
  canApprove?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const pending = item.status === "PENDING";
  const approved = item.status === "APPROVED";
  const rejected = item.status === "REJECTED";

  return (
    <li
      className={cn(
        "rounded-md border px-2 py-1.5 text-[10px] font-medium space-y-1",
        approved
          ? "border-violet-500/40 bg-violet-500/15 text-violet-900 dark:text-violet-100"
          : rejected
            ? "border-rose-500/45 bg-rose-500/15 text-rose-800 dark:text-rose-200"
            : pending
              ? "border-sky-500/40 bg-sky-500/15 text-sky-900 dark:text-sky-100"
              : "border-violet-500/35 bg-violet-500/10",
      )}
    >
      <div>
        <FileText className="mb-0.5 inline size-3" />{" "}
        {item.fromTime} – {item.toTime}: Justificativa voluntária
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          {pending ? <Hourglass className="size-3" /> : null}
          {approved ? <CheckCircle2 className="size-3" /> : null}
          {rejected ? <XCircle className="size-3" /> : null}
          <span>
            {pending
              ? "Aguardando aprovação (não substitui alerta de lacuna)"
              : approved
                ? "Aprovada"
                : "Rejeitada"}
          </span>
        </div>
        {item.reason.trim() ? (
          <p className="whitespace-pre-wrap text-[10px] leading-snug text-foreground/90">
            {item.reason.trim()}
          </p>
        ) : null}
      </div>
      {canApprove && pending && onApprove && onReject ? (
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-500"
            onClick={onApprove}
          >
            Aprovar
          </button>
          <button
            type="button"
            className="rounded bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-rose-500"
            onClick={onReject}
          >
            Rejeitar
          </button>
        </div>
      ) : null}
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

function timeKey(value: string | null | undefined): string {
  return String(value ?? "").trim().slice(0, 5);
}

/**
 * Mesma fonte da visão mensal (`insights.gaps`): mescla apontamentos + todos os gaps
 * (inclui alerta no fim do dia, que não fica entre dois tickets).
 */
export function buildDayTimeline(summary: RendimentoDaySummary) {
  type TimelineItem =
    | { kind: "entry"; entry: RendimentoEntry }
    | { kind: "gap"; gap: RendimentoGap }
    | { kind: "voluntary"; voluntary: RendimentoVoluntaryJustification };

  const entries = sortEntriesByStart(summary.entries);
  const gaps = [...(summary.insights?.gaps ?? [])].sort((a, b) =>
    timeKey(a.fromTime).localeCompare(timeKey(b.fromTime)),
  );
  const voluntary = [...(summary.voluntaryJustifications ?? [])].sort((a, b) =>
    timeKey(a.fromTime).localeCompare(timeKey(b.fromTime)),
  );

  const items: TimelineItem[] = [];
  let entryIndex = 0;
  let gapIndex = 0;
  let voluntaryIndex = 0;

  while (
    entryIndex < entries.length ||
    gapIndex < gaps.length ||
    voluntaryIndex < voluntary.length
  ) {
    const entry = entries[entryIndex];
    const gap = gaps[gapIndex];
    const vol = voluntary[voluntaryIndex];
    const entryAt = timeKey(entry?.initTime);
    const gapAt = timeKey(gap?.fromTime);
    const volAt = timeKey(vol?.fromTime);

    const candidates: Array<{ at: string; push: () => void }> = [];
    if (gap) {
      candidates.push({
        at: gapAt,
        push: () => {
          items.push({ kind: "gap", gap });
          gapIndex += 1;
        },
      });
    }
    if (vol) {
      candidates.push({
        at: volAt,
        push: () => {
          items.push({ kind: "voluntary", voluntary: vol });
          voluntaryIndex += 1;
        },
      });
    }
    if (entry) {
      candidates.push({
        at: entryAt,
        push: () => {
          items.push({ kind: "entry", entry });
          entryIndex += 1;
        },
      });
    }

    candidates.sort((a, b) => a.at.localeCompare(b.at));
    candidates[0]?.push();
  }

  return items;
}

/** Indicadores do dia alinhados com o que a timeline do dia exibe. */
export function dayInsightsForDisplay(summary?: RendimentoDaySummary) {
  if (!summary?.insights) return null;
  const gaps = summary.insights.gaps ?? [];
  const idleGaps = gaps.filter(
    (g) => g.type === "idle" && g.gapMinutes > 60,
  );
  const hasPendingIdleAlert = idleGaps.some((g) => {
    const j = g.justification;
    if (!j) return true;
    if (j.kind === "VOLUNTARY") return false;
    return j.status !== "APPROVED";
  });

  return {
    ...summary.insights,
    hasIdleGapAlert: hasPendingIdleAlert,
    hasExpectedLunch: gaps.some((g) => g.type === "lunch"),
  };
}
