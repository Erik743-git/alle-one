"use client";

import * as React from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import {
  buildDayTimeline,
  dayInsightsForDisplay,
  RendimentoDayIndicators,
  RendimentoGapBlock,
  RendimentoVoluntaryJustificationBlock,
} from "@/components/rendimento/rendimento-calendar-parts";
import {
  buildTimelineBlocks,
  RendimentoTimelineLegend,
  RendimentoTimelineTrack,
  timelineBarFillClass,
  workdayFillPercent,
} from "@/components/rendimento/rendimento-timeline-parts";
import {
  RendimentoOvertimeBadge,
  RendimentoOvertimeServiceLine,
} from "@/components/rendimento/rendimento-overtime-badge";
import { Button } from "@/components/ui/button";
import {
  rendimentoOvertimeCardClass,
  resolveRendimentoOvertimeDisplay,
} from "@/lib/rendimento/entry-overtime";
import {
  RENDIMENTO_OVERTIME_APPROVED_NOTE,
  RENDIMENTO_OVERTIME_BALANCE_LABEL,
} from "@/lib/module-copy";
import { cn } from "@/lib/utils";
import type {
  RendimentoCalendarView,
  RendimentoDaySummary,
  RendimentoTimesheet,
} from "@/lib/services/rendimento.service";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export type RendimentoTimelineCalendarProps = {
  timesheet: RendimentoTimesheet | null;
  view: RendimentoCalendarView;
  referenceDate: Date;
  loading?: boolean;
  refreshing?: boolean;
  canApproveJustification?: boolean;
  pjSimplifiedView?: boolean;
  onOpenAlertJustification?: (params: {
    date: string;
    fromTime: string;
    toTime: string;
    gapMinutes: number;
    gapType: "idle" | "lunch";
  }) => void;
  onOpenVoluntaryJustification?: (params: { date: string }) => void;
  onApproveJustification?: (id: string) => void;
  onRejectJustification?: (id: string) => void;
  onApproveDayEvent?: (id: string) => void;
  onRejectDayEvent?: (id: string) => void;
  onViewChange: (view: RendimentoCalendarView) => void;
  onReferenceDateChange: (date: Date) => void;
};

function dayMap(timesheet: RendimentoTimesheet | null) {
  const map = new Map<string, RendimentoDaySummary>();
  if (!timesheet) return map;
  for (const day of timesheet.days) {
    map.set(day.date.slice(0, 10), day);
  }
  return map;
}

function formatRangeTitle(view: RendimentoCalendarView, reference: Date) {
  if (view === "day") {
    return format(reference, "EEEE, d 'de' MMMM yyyy", { locale: ptBR });
  }
  if (view === "week") {
    const start = startOfWeek(reference, { weekStartsOn: 0 });
    const end = endOfWeek(reference, { weekStartsOn: 0 });
    return `${format(start, "d MMM", { locale: ptBR })} – ${format(end, "d MMM yyyy", { locale: ptBR })}`;
  }
  return format(reference, "MMMM yyyy", { locale: ptBR });
}

function emptyDaySummary(dateKey: string): RendimentoDaySummary {
  return {
    date: dateKey,
    totalMinutes: 0,
    totalHoursFormatted: "00:00",
    entries: [],
    insights: {
      regularMinutes: 0,
      overtimeMinutes: 0,
      hasOvertime: false,
      hasIdleGapAlert: false,
      hasExpectedLunch: false,
      gaps: [],
    },
    voluntaryJustifications: [],
  };
}

function daySummaryHasOvertime(summary?: RendimentoDaySummary): boolean {
  if (!summary) return false;
  if (summary.insights?.hasOvertime) return true;
  return (summary.entries ?? []).some(
    (entry) => resolveRendimentoOvertimeDisplay(entry).kind === "EXTRA",
  );
}

function DayDetailList({
  displayDay,
  pjSimplifiedView,
  canApproveJustification,
  onOpenAlertJustification,
  onApproveJustification,
  onRejectJustification,
  onApproveDayEvent,
  onRejectDayEvent,
}: {
  displayDay: RendimentoDaySummary;
  pjSimplifiedView: boolean;
  canApproveJustification: boolean;
  onOpenAlertJustification?: RendimentoTimelineCalendarProps["onOpenAlertJustification"];
  onApproveJustification?: (id: string) => void;
  onRejectJustification?: (id: string) => void;
  onApproveDayEvent?: (id: string) => void;
  onRejectDayEvent?: (id: string) => void;
}) {
  const timelineItems = buildDayTimeline(displayDay, {
    appointmentsOnly: pjSimplifiedView,
  });

  return (
    <ul className="space-y-2 p-4">
      {timelineItems.length === 0 ? (
        <li className="py-8 text-center text-sm text-muted-foreground">
          Nenhum apontamento neste dia.
        </li>
      ) : (
        timelineItems.map((item, index) =>
          item.kind === "gap" ? (
            <RendimentoGapBlock
              key={`day-gap-${item.gap.fromTime}-${index}`}
              gap={item.gap}
              onJustify={
                onOpenAlertJustification
                  ? () =>
                      onOpenAlertJustification({
                        date: displayDay.date.slice(0, 10),
                        fromTime: item.gap.fromTime,
                        toTime: item.gap.toTime,
                        gapMinutes: item.gap.gapMinutes,
                        gapType: item.gap.type,
                      })
                  : undefined
              }
              canApprove={canApproveJustification}
              onApprove={
                item.gap.justification?.id && onApproveJustification
                  ? () => onApproveJustification(item.gap.justification!.id)
                  : undefined
              }
              onReject={
                item.gap.justification?.id && onRejectJustification
                  ? () => onRejectJustification(item.gap.justification!.id)
                  : undefined
              }
            />
          ) : item.kind === "voluntary" ? (
            <RendimentoVoluntaryJustificationBlock
              key={`day-voluntary-${item.voluntary.id}-${index}`}
              item={item.voluntary}
              canApprove={canApproveJustification}
              onApprove={
                onApproveJustification
                  ? () => onApproveJustification(item.voluntary.id)
                  : undefined
              }
              onReject={
                onRejectJustification
                  ? () => onRejectJustification(item.voluntary.id)
                  : undefined
              }
            />
          ) : (
            <li
              key={item.entry.id}
              className={cn(
                "flex flex-col gap-1 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
                (() => {
                  const overtime = resolveRendimentoOvertimeDisplay(item.entry);
                  return overtime.kind
                    ? rendimentoOvertimeCardClass(overtime.kind)
                    : "border-border bg-muted/20";
                })(),
              )}
            >
              <div>
                <p className="font-semibold text-foreground">
                  {item.entry.initTime?.slice(0, 5) ?? "—"} –{" "}
                  {item.entry.endTime?.slice(0, 5) ?? "—"}
                  <span className="ml-2">
                    <RendimentoOvertimeBadge entry={item.entry} />
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Ticket #{item.entry.ticketNumber}
                  {item.entry.clientName ? ` · ${item.entry.clientName}` : ""}
                </p>
                <RendimentoOvertimeServiceLine entry={item.entry} />
                {item.entry.description ? (
                  <p className="mt-1 text-sm text-foreground/80">
                    {item.entry.description}
                  </p>
                ) : null}
                {item.entry.debitProtected ? (
                  <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    {RENDIMENTO_OVERTIME_APPROVED_NOTE}
                  </p>
                ) : null}
                {canApproveJustification &&
                item.entry.dayEventId &&
                item.entry.dayEventStatus === "PENDING" &&
                resolveRendimentoOvertimeDisplay(item.entry).kind ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {onApproveDayEvent ? (
                      <button
                        type="button"
                        className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-emerald-500"
                        onClick={() => onApproveDayEvent(item.entry.dayEventId!)}
                      >
                        Aprovar{" "}
                        {resolveRendimentoOvertimeDisplay(item.entry).kind ===
                        "PLANTAO"
                          ? "plantão"
                          : "HE"}
                      </button>
                    ) : null}
                    {onRejectDayEvent ? (
                      <button
                        type="button"
                        className="rounded bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-rose-500"
                        onClick={() => onRejectDayEvent(item.entry.dayEventId!)}
                      >
                        Não aprovar
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1 text-sm font-bold",
                  (() => {
                    const overtime = resolveRendimentoOvertimeDisplay(
                      item.entry,
                    );
                    if (overtime.kind === "PLANTAO") {
                      return "bg-violet-500/25 text-violet-900 dark:text-violet-100";
                    }
                    if (overtime.kind === "EXTRA") {
                      return "alle-badge-overtime";
                    }
                    return "bg-primary/15 text-primary";
                  })(),
                )}
              >
                {item.entry.hoursFormatted}
              </span>
            </li>
          ),
        )
      )}
    </ul>
  );
}

export function RendimentoTimelineCalendar({
  timesheet,
  view,
  referenceDate,
  loading = false,
  refreshing = false,
  canApproveJustification = false,
  pjSimplifiedView = false,
  onOpenAlertJustification,
  onOpenVoluntaryJustification,
  onApproveJustification,
  onRejectJustification,
  onApproveDayEvent,
  onRejectDayEvent,
  onViewChange,
  onReferenceDateChange,
}: RendimentoTimelineCalendarProps) {
  const daysByDate = React.useMemo(() => dayMap(timesheet), [timesheet]);

  function navigate(delta: -1 | 1) {
    const next =
      view === "month"
        ? (() => {
            const anchor = startOfMonth(referenceDate);
            const shifted =
              delta === 1 ? addMonths(anchor, 1) : subMonths(anchor, 1);
            shifted.setDate(15);
            return shifted;
          })()
        : view === "week"
          ? delta === 1
            ? addWeeks(referenceDate, 1)
            : subWeeks(referenceDate, 1)
          : delta === 1
            ? addDays(referenceDate, 1)
            : subDays(referenceDate, 1);
    onReferenceDateChange(next);
  }

  const monthGridDays = React.useMemo(() => {
    const monthStart = startOfMonth(referenceDate);
    const monthEnd = endOfMonth(referenceDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [referenceDate]);

  const weekDays = React.useMemo(() => {
    const start = startOfWeek(referenceDate, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [referenceDate]);

  const selectedDayKey = format(referenceDate, "yyyy-MM-dd");
  const selectedDay = daysByDate.get(selectedDayKey);
  const displayDay =
    view === "day"
      ? (selectedDay ?? emptyDaySummary(selectedDayKey))
      : selectedDay;

  const dayBlocks = React.useMemo(
    () =>
      displayDay
        ? buildTimelineBlocks(displayDay, { appointmentsOnly: pjSimplifiedView })
        : [],
    [displayDay, pjSimplifiedView],
  );

  return (
    <div className="font-sans space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(["month", "week", "day"] as const).map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={view === option ? "default" : "outline"}
              onClick={() => onViewChange(option)}
            >
              {option === "month" ? "Mês" : option === "week" ? "Semana" : "Dia"}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => navigate(-1)}
            aria-label="Período anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[12rem] text-center text-sm font-semibold capitalize text-foreground">
            {formatRangeTitle(view, referenceDate)}
          </span>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => navigate(1)}
            aria-label="Próximo período"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
        <RendimentoTimelineLegend simplified={pjSimplifiedView} />
      </div>

      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <p className="mb-3 text-xs text-muted-foreground">
          Totais do período sem contar horas sobrepostas no mesmo dia.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Horas trabalhadas</p>
            <p className="text-2xl font-bold text-foreground">
              {loading && !timesheet ? "—" : timesheet?.totalHoursFormatted ?? "00:00"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              Horas extras
              {timesheet?.periodOvertimeRangeLabel ? (
                <span className="block text-[11px] font-normal">
                  Período {timesheet.periodOvertimeRangeLabel} (dia 26 ao 25)
                </span>
              ) : (
                <span className="block text-[11px] font-normal">
                  Período dia 26 ao dia 25
                </span>
              )}
            </p>
            <p className="text-2xl font-bold alle-stat-overtime">
              {loading && !timesheet
                ? "—"
                : timesheet?.periodOvertimeFormatted ?? "00:00"}
            </p>
            {!pjSimplifiedView ? (
              <p className="text-xs text-muted-foreground">
                {RENDIMENTO_OVERTIME_BALANCE_LABEL}:{" "}
                {loading && !timesheet
                  ? "—"
                  : timesheet?.overtimeBalanceFormatted ?? "00:00"}
              </p>
            ) : null}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Horas de plantão</p>
            <p className="text-2xl font-bold text-violet-600 dark:text-violet-300">
              {loading && !timesheet
                ? "—"
                : timesheet?.periodPlantaoFormatted ?? "00:00"}
            </p>
          </div>
        </div>
      </div>

      {loading && !timesheet ? (
        <div className="flex min-h-[280px] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : null}

      {timesheet && view === "month" ? (
        <div className="relative overflow-hidden rounded-xl border border-border">
          {refreshing ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : null}
          <div className="grid grid-cols-7 border-b border-border bg-muted/40">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground"
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthGridDays.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const summary = daysByDate.get(key);
              const inMonth = isSameMonth(day, referenceDate);
              const isToday = isSameDay(day, new Date());
              const insights = dayInsightsForDisplay(summary);
              const hasGapAlert =
                !pjSimplifiedView && Boolean(insights?.hasIdleGapAlert);
              const fillPct = workdayFillPercent(summary?.totalMinutes ?? 0);

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    onReferenceDateChange(day);
                    onViewChange("day");
                  }}
                  className={cn(
                    "min-h-[104px] border-b border-r border-border p-2 text-left transition hover:bg-muted/30",
                    !inMonth && "bg-muted/20 text-muted-foreground",
                    isToday && "ring-2 ring-inset ring-primary/50",
                    hasGapAlert && "ring-1 ring-inset ring-orange-500/50",
                  )}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span
                      className={cn(
                        "inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                        isToday && "bg-primary text-primary-foreground",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {hasGapAlert ? (
                      <span
                        className="mt-1 size-1.5 shrink-0 rounded-full bg-orange-500"
                        title="Dia com lacuna a justificar"
                      />
                    ) : null}
                  </div>

                  {summary && summary.totalMinutes > 0 ? (
                    <div className="mt-2 space-y-1">
                      <div className="h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            timelineBarFillClass(summary, hasGapAlert),
                          )}
                          style={{ width: `${fillPct}%` }}
                        />
                      </div>
                      <p
                        className={cn(
                          "text-[11px] font-bold",
                          daySummaryHasOvertime(summary)
                            ? "alle-stat-overtime"
                            : "text-foreground",
                        )}
                      >
                        {summary.totalHoursFormatted}
                      </p>
                    </div>
                  ) : inMonth ? (
                    <p className="mt-3 text-[10px] text-muted-foreground">—</p>
                  ) : null}

                  <RendimentoDayIndicators
                    summary={summary}
                    compact
                    showLunch={false}
                    hideGapAlerts={pjSimplifiedView}
                  />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {timesheet && view === "week" ? (
        <div className="relative rounded-xl border border-border bg-card">
          {refreshing ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/60">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : null}

          <div className="grid grid-cols-[4.5rem_1fr_3.5rem] gap-2 border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Dia</span>
            <span>Linha do tempo</span>
            <span className="text-right">Total</span>
          </div>

          <div className="divide-y divide-border">
            {weekDays.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const summary = daysByDate.get(key);
              const isToday = isSameDay(day, new Date());
              const isSelected = isSameDay(day, referenceDate);
              const insights = dayInsightsForDisplay(summary);
              const hasGapAlert =
                !pjSimplifiedView && Boolean(insights?.hasIdleGapAlert);
              const blocks = summary
                ? buildTimelineBlocks(summary, {
                    appointmentsOnly: pjSimplifiedView,
                  })
                : [];

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    onReferenceDateChange(day);
                    onViewChange("day");
                  }}
                  className={cn(
                    "grid w-full grid-cols-[4.5rem_1fr_3.5rem] items-center gap-2 px-3 py-3 text-left transition hover:bg-muted/25",
                    isSelected && "bg-muted/40",
                    isToday && !isSelected && "bg-primary/5",
                  )}
                >
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      {format(day, "EEE", { locale: ptBR })}
                    </p>
                    <p className="text-lg font-bold text-foreground">
                      {format(day, "d")}
                    </p>
                    {hasGapAlert ? (
                      <p className="text-[10px] font-medium text-orange-600 dark:text-orange-400">
                        lacuna
                      </p>
                    ) : null}
                  </div>

                  <RendimentoTimelineTrack
                    blocks={blocks}
                    height={32}
                    compact
                  />

                  <p
                    className={cn(
                      "text-right text-sm font-bold",
                      daySummaryHasOvertime(summary)
                        ? "alle-stat-overtime"
                        : "text-foreground",
                    )}
                  >
                    {summary?.totalHoursFormatted ?? "00:00"}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {timesheet && view === "day" && displayDay ? (
        <div className="rounded-xl border border-border bg-card">
          <div className="space-y-4 border-b border-border px-4 py-4">
            <div>
              <p className="text-sm text-muted-foreground">Dia selecionado</p>
              <p className="font-semibold text-foreground">
                {format(referenceDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
              </p>
              <p
                className={cn(
                  "text-lg font-bold",
                  daySummaryHasOvertime(displayDay)
                    ? "alle-stat-overtime"
                    : "text-foreground",
                )}
              >
                {displayDay.totalHoursFormatted ?? "00:00"}
              </p>
              {displayDay.insights ? (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-md border border-border bg-muted px-2 py-1 text-foreground">
                    Regular:{" "}
                    {String(
                      Math.floor(displayDay.insights.regularMinutes / 60),
                    ).padStart(2, "0")}
                    :
                    {String(displayDay.insights.regularMinutes % 60).padStart(
                      2,
                      "0",
                    )}
                  </span>
                  {displayDay.insights.hasOvertime ? (
                    <span className="alle-badge-overtime rounded-md border border-amber-500/45 px-2 py-1 font-semibold">
                      Hora extra:{" "}
                      {String(
                        Math.floor(displayDay.insights.overtimeMinutes / 60),
                      ).padStart(2, "0")}
                      :
                      {String(displayDay.insights.overtimeMinutes % 60).padStart(
                        2,
                        "0",
                      )}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <RendimentoDayIndicators
                summary={displayDay}
                hideGapAlerts={pjSimplifiedView}
              />
              {!pjSimplifiedView && onOpenVoluntaryJustification ? (
                <div className="mt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onOpenVoluntaryJustification({ date: selectedDayKey })
                    }
                  >
                    Justificativa voluntária
                  </Button>
                </div>
              ) : null}
            </div>

            <RendimentoTimelineTrack blocks={dayBlocks} height={64} />
          </div>

          <DayDetailList
            displayDay={displayDay}
            pjSimplifiedView={pjSimplifiedView}
            canApproveJustification={canApproveJustification}
            onOpenAlertJustification={onOpenAlertJustification}
            onApproveJustification={onApproveJustification}
            onRejectJustification={onRejectJustification}
            onApproveDayEvent={onApproveDayEvent}
            onRejectDayEvent={onRejectDayEvent}
          />
        </div>
      ) : null}
    </div>
  );
}

export function toDateInputValue(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function parseDateInput(value?: string) {
  if (!value) return new Date();
  const parsed = parseISO(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
