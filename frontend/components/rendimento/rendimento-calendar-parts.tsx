"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Coffee,
  Clock,
  FileText,
  Hourglass,
  Shield,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { RendimentoOvertimeBadge } from "@/components/rendimento/rendimento-overtime-badge";
import {
  rendimentoOvertimeCardClass,
  resolveRendimentoOvertimeDisplay,
} from "@/lib/rendimento/entry-overtime";
import { cn } from "@/lib/utils";
import {
  RENDIMENTO_GAP_LEGEND,
  RENDIMENTO_LUNCH_LEGEND,
} from "@/lib/module-copy";
import type {
  RendimentoDaySummary,
  RendimentoEntry,
  RendimentoGap,
  RendimentoVoluntaryJustification,
} from "@/lib/services/rendimento.service";

export function RendimentoLegend({ simplified = false }: { simplified?: boolean }) {
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
      {!simplified ? (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-orange-500" />
            <AlertTriangle className="size-3 text-orange-500" />
            {RENDIMENTO_GAP_LEGEND}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Coffee className="size-3 text-emerald-600" />
            {RENDIMENTO_LUNCH_LEGEND}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Hourglass className="size-3 text-sky-500" />
            Justificativa voluntária pendente
          </span>
        </>
      ) : null}
    </div>
  );
}

function dayHasHoraExtra(summary?: RendimentoDaySummary): boolean {
  return (summary?.entries ?? []).some(
    (entry) => resolveRendimentoOvertimeDisplay(entry).kind === "EXTRA",
  );
}

function dayHasPlantao(summary?: RendimentoDaySummary): boolean {
  return (summary?.entries ?? []).some(
    (entry) => resolveRendimentoOvertimeDisplay(entry).kind === "PLANTAO",
  );
}

function dayHasPendingVoluntary(summary?: RendimentoDaySummary): boolean {
  return (summary?.voluntaryJustifications ?? []).some(
    (item) => item.status === "PENDING",
  );
}

export function RendimentoDayIndicators({
  summary,
  compact = false,
  showLunch = true,
  hideGapAlerts = false,
}: {
  summary?: RendimentoDaySummary;
  compact?: boolean;
  /** Visão mensal: HE, plantão, alerta e voluntária pendente (sem almoço). */
  showLunch?: boolean;
  /** Terceiro (PJ): só HE e plantão. */
  hideGapAlerts?: boolean;
}) {
  const insights = dayInsightsForDisplay(summary);
  const monthMode = !showLunch;
  const hasHoraExtra = monthMode
    ? dayHasHoraExtra(summary)
    : Boolean(insights?.hasOvertime);
  const hasPlantao = monthMode && dayHasPlantao(summary);
  const hasPendingVoluntary = monthMode && dayHasPendingVoluntary(summary);

  if (
    !insights &&
    !hasHoraExtra &&
    !hasPlantao &&
    !hasPendingVoluntary
  ) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap gap-1", compact ? "mt-1" : "mt-2")}>
      {hasHoraExtra ? (
        <span
          className="alle-badge-overtime inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold"
          title="Hora extra no dia"
        >
          <Clock className="size-2.5" />
          HE
        </span>
      ) : null}
      {hasPlantao ? (
        <span
          className="inline-flex items-center gap-0.5 rounded bg-violet-600/20 px-1 py-0.5 text-[9px] font-bold text-violet-700 dark:text-violet-300"
          title="Plantão no dia"
        >
          <Shield className="size-2.5" />
          P
        </span>
      ) : null}
      {!hideGapAlerts && insights?.hasIdleGapAlert ? (
        <span
          className="alle-badge-idle inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold"
          title="Intervalo sem registro de horas (> 1h)"
        >
          <AlertTriangle className="size-2.5" />
          !
        </span>
      ) : null}
      {!hideGapAlerts && hasPendingVoluntary ? (
        <span
          className="inline-flex items-center gap-0.5 rounded bg-sky-500/20 px-1 py-0.5 text-[9px] font-bold text-sky-700 dark:text-sky-300"
          title="Justificativa voluntária aguardando aprovação"
        >
          <Hourglass className="size-2.5" />
        </span>
      ) : null}
      {!hideGapAlerts && showLunch && insights?.hasExpectedLunch ? (
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
  canEdit,
  onEdit,
}: {
  gap: RendimentoGap;
  onJustify?: () => void;
  canApprove?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  canEdit?: boolean;
  onEdit?: () => void;
}) {
  const isLunch = gap.type === "lunch";
  const justification = gap.justification;
  const justificationPending = justification?.status === "PENDING";
  const justificationApproved = justification?.status === "APPROVED";
  const justificationRejected = justification?.status === "REJECTED";
  const isTailDeficit = gap.label.startsWith("Faltam ");
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
                : "alle-surface-idle",
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
                  : "Justificativa não aprovada"}
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
        {onJustify && !isLunch && !justification && !isTailDeficit ? (
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
            Não aprovar
          </button>
        ) : null}
        {canEdit && onEdit ? (
          <button
            type="button"
            className="rounded bg-background/70 px-2 py-0.5 text-[10px] font-bold text-foreground hover:bg-background"
            onClick={onEdit}
          >
            Editar
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
  const router = useRouter();
  const overtime = resolveRendimentoOvertimeDisplay(entry);
  return (
    <li
      role="link"
      tabIndex={0}
      className={cn(
        "cursor-pointer rounded-md border px-2 py-1 text-[10px] transition-colors hover:brightness-110",
        overtime.kind
          ? rendimentoOvertimeCardClass(overtime.kind)
          : "border-primary/20 bg-primary/10 text-foreground",
      )}
      onClick={() => router.push(`/tickets/${entry.ticketNumber}`)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(`/tickets/${entry.ticketNumber}`);
        }
      }}
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

/** Aviso pontual — independente do intervalo sem registro de horas. */
export function RendimentoVoluntaryJustificationBlock({
  item,
  canApprove,
  onApprove,
  onReject,
  canDelete,
  onDelete,
  canEdit,
  onEdit,
}: {
  item: RendimentoVoluntaryJustification;
  canApprove?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  canDelete?: boolean;
  onDelete?: () => void;
  canEdit?: boolean;
  onEdit?: () => void;
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
      {(canApprove && pending && onApprove && onReject) ||
      (canDelete && onDelete) ||
      (canEdit && onEdit) ? (
        <div className="flex flex-wrap items-center gap-1">
          {canApprove && pending && onApprove ? (
            <button
              type="button"
              className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-500"
              onClick={onApprove}
            >
              Aprovar
            </button>
          ) : null}
          {canApprove && pending && onReject ? (
            <button
              type="button"
              className="rounded bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-rose-500"
              onClick={onReject}
            >
              Não aprovar
            </button>
          ) : null}
          {canDelete && onDelete ? (
            <button
              type="button"
              className="rounded bg-rose-600/90 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-rose-600"
              onClick={onDelete}
            >
              Excluir
            </button>
          ) : null}
          {canEdit && onEdit ? (
            <button
              type="button"
              className="rounded bg-background/70 px-2 py-0.5 text-[10px] font-bold text-foreground hover:bg-background"
              onClick={onEdit}
            >
              Editar
            </button>
          ) : null}
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
export function buildDayTimeline(
  summary: RendimentoDaySummary,
  options?: { appointmentsOnly?: boolean },
) {
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

  if (options?.appointmentsOnly) {
    return items.filter((item) => item.kind === "entry");
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
    return j.status === "PENDING";
  });

  return {
    ...summary.insights,
    hasIdleGapAlert: hasPendingIdleAlert,
    hasExpectedLunch: gaps.some((g) => g.type === "lunch"),
  };
}
