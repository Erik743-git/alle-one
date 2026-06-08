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
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Loader2,
  MessageSquare,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { summarizeCompanyAppointmentDescription } from "@/lib/rendimento/company-description";
import type {
  RendimentoCompanyAgenda,
  RendimentoCompanyAppointment,
  RendimentoCompanyDay,
} from "@/lib/services/rendimento.service";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export type CompanyAgendaCalendarView = "month" | "week" | "day";

type CompanyAgendaCalendarProps = {
  agenda: RendimentoCompanyAgenda | null;
  view: CompanyAgendaCalendarView;
  referenceDate: Date;
  loading?: boolean;
  refreshing?: boolean;
  isClientUser?: boolean;
  isAdmin?: boolean;
  onViewChange: (view: CompanyAgendaCalendarView) => void;
  onReferenceDateChange: (date: Date) => void;
  onQuestion?: (entry: RendimentoCompanyAppointment) => void;
  onAnswer?: (entry: RendimentoCompanyAppointment) => void;
};

function dayMap(agenda: RendimentoCompanyAgenda | null) {
  const map = new Map<string, RendimentoCompanyDay>();
  if (!agenda?.days?.length) return map;
  for (const day of agenda.days) {
    map.set(day.date.slice(0, 10), day);
  }
  return map;
}

function formatRangeTitle(view: CompanyAgendaCalendarView, reference: Date) {
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

function formatMinutesLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatTimeLabel(value: string | null | undefined) {
  if (!value) return "—";
  const trimmed = String(value).trim();
  if (!trimmed) return "—";
  if (trimmed.includes("T")) {
    const timePart = trimmed.slice(11, 16);
    return timePart.length === 5 ? timePart : "—";
  }
  return trimmed.slice(0, 5);
}

function emptyDay(date: string): RendimentoCompanyDay {
  return {
    date,
    totalMinutes: 0,
    totalHoursFormatted: "00:00",
    appointmentCount: 0,
    pendingQuestions: 0,
    entries: [],
  };
}

function DayQuestionIndicator({
  day,
  compact = false,
}: {
  day?: RendimentoCompanyDay;
  compact?: boolean;
}) {
  if (!day?.pendingQuestions) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded font-bold text-amber-800 dark:text-amber-200",
        compact
          ? "bg-amber-500/25 px-1 py-0.5 text-[9px]"
          : "bg-amber-500/30 px-1.5 py-0.5 text-[10px]",
      )}
      title={`${day.pendingQuestions} questionamento(s) pendente(s)`}
    >
      <MessageSquare className={compact ? "size-2.5" : "size-3"} />
      {compact ? day.pendingQuestions : `Quest. ${day.pendingQuestions}`}
    </span>
  );
}

function CompanyAgendaLegend() {
  return (
    <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <span className="font-semibold text-foreground">Legenda:</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
          08:00
        </span>
        Horas no dia
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-200">
          <MessageSquare className="size-3" />
          Quest.
        </span>
        Questionamento pendente
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3 rounded-sm ring-2 ring-amber-500/50" />
        Dia com questionamento
      </span>
    </div>
  );
}

function CompanyEntryCard({
  entry,
  dense = false,
  isClientUser,
  isAdmin,
  onQuestion,
  onAnswer,
}: {
  entry: RendimentoCompanyAppointment;
  dense?: boolean;
  isClientUser?: boolean;
  isAdmin?: boolean;
  onQuestion?: () => void;
  onAnswer?: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const q = entry.question;
  const desc = summarizeCompanyAppointmentDescription(
    entry.descriptionFull ?? entry.description,
  );
  const showText = expanded && desc.truncated ? desc.full : desc.summary;

  return (
    <li
      className={cn(
        "rounded-xl border border-border bg-muted/20",
        dense ? "px-2 py-2 text-xs" : "px-4 py-3",
        q?.status === "PENDING" && "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <div
        className={cn(
          "flex gap-2",
          dense ? "flex-col" : "flex-col sm:flex-row sm:items-start sm:justify-between",
        )}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <p className={cn("font-semibold text-foreground", dense && "text-[11px]")}>
            {formatTimeLabel(entry.initTime)} – {formatTimeLabel(entry.endTime)}
            <span className="ml-2 font-bold text-primary">
              {entry.hoursFormatted ?? formatMinutesLabel(entry.minutes)}
            </span>
          </p>
          <p className="text-muted-foreground">
            #{entry.ticketNumber}
            {entry.serviceName ? ` · ${entry.serviceName}` : ""}
          </p>
          {entry.userName ? (
            <p className="inline-flex items-center gap-1 text-foreground/80">
              <User className="size-3 shrink-0 text-muted-foreground" />
              {entry.userName}
            </p>
          ) : null}
          {showText ? (
            <p
              className={cn(
                "text-foreground/80",
                dense ? "line-clamp-2 text-[10px]" : "text-sm",
                !dense && !expanded && desc.truncated && "line-clamp-2",
              )}
            >
              {showText}
            </p>
          ) : null}
          {desc.truncated && !dense ? (
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Ver menos" : "Ver descrição completa"}
            </button>
          ) : null}
          {q?.status === "ANSWERED" && !dense ? (
            <div className="mt-2 rounded-lg bg-muted/50 p-2 text-xs">
              {q.abonado ? (
                <p className="font-medium text-emerald-600">Abonado</p>
              ) : (
                <p className="font-medium text-foreground">Respondido</p>
              )}
              {q.adminResponse ? (
                <p className="mt-0.5 text-muted-foreground">{q.adminResponse}</p>
              ) : null}
            </div>
          ) : null}
          {q?.status === "PENDING" && isClientUser && !dense ? (
            <p className="text-xs text-amber-600">
              Questionamento enviado — aguardando resposta.
            </p>
          ) : null}
        </div>
        {!dense ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {entry.source === "portal" ? (
              <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Só portal
              </span>
            ) : null}
            {q?.status === "PENDING" ? (
              <span className="rounded-md border border-amber-500/50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                Aguardando
              </span>
            ) : null}
            {isClientUser && !q && onQuestion ? (
              <Button type="button" size="sm" variant="outline" onClick={onQuestion}>
                <HelpCircle className="mr-1.5 size-3.5" />
                Questionar
              </Button>
            ) : null}
            {isAdmin && q?.status === "PENDING" && onAnswer ? (
              <Button type="button" size="sm" onClick={onAnswer}>
                Responder
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function CompanyAgendaCalendar({
  agenda,
  view,
  referenceDate,
  loading = false,
  refreshing = false,
  isClientUser = false,
  isAdmin = false,
  onViewChange,
  onReferenceDateChange,
  onQuestion,
  onAnswer,
}: CompanyAgendaCalendarProps) {
  const daysByDate = React.useMemo(() => dayMap(agenda), [agenda]);
  const selectedDayKey = format(referenceDate, "yyyy-MM-dd");
  const selectedDay = daysByDate.get(selectedDayKey) ?? emptyDay(selectedDayKey);

  const totalMinutes = agenda?.totalMinutes ?? 0;
  const totalFormatted = agenda?.totalHoursFormatted ?? "00:00";
  const totalAppointments = agenda?.totalAppointments ?? 0;
  const totalPendingQuestions =
    agenda?.totalPendingQuestions ??
    agenda?.days?.reduce((sum, day) => sum + day.pendingQuestions, 0) ??
    0;

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

      <CompanyAgendaLegend />

      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Horas no período</p>
            <p className="text-2xl font-bold text-foreground">
              {loading && !agenda ? "—" : totalFormatted}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Apontamentos</p>
            <p className="text-2xl font-bold text-primary">
              {loading && !agenda ? "—" : totalAppointments}
            </p>
            <p className="text-xs text-muted-foreground">
              {totalMinutes > 0
                ? `${totalAppointments} registro(s) · ${totalFormatted} total`
                : "Nenhum registro no período"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Questionamentos</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {loading && !agenda ? "—" : totalPendingQuestions}
            </p>
            <p className="text-xs text-muted-foreground">
              {totalPendingQuestions > 0
                ? "Pendentes no período"
                : "Nenhum pendente"}
            </p>
          </div>
        </div>
      </div>

      {loading && !agenda ? (
        <div className="flex min-h-[280px] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : null}

      {agenda && view === "month" ? (
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

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    onReferenceDateChange(day);
                    onViewChange("day");
                  }}
                  className={cn(
                    "min-h-[96px] border-b border-r border-border p-2 text-left transition hover:bg-muted/30",
                    !inMonth && "bg-muted/20 text-muted-foreground",
                    summary?.pendingQuestions
                      ? "ring-1 ring-inset ring-amber-500/50"
                      : "",
                  )}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span
                      className={cn(
                        "inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                        isToday && "bg-primary text-primary-foreground",
                        summary?.pendingQuestions
                          ? "ring-2 ring-amber-500/60 ring-offset-1 ring-offset-background"
                          : "",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    <div className="flex flex-col items-end gap-0.5">
                      {summary && summary.totalMinutes > 0 ? (
                        <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                          {summary.totalHoursFormatted}
                        </span>
                      ) : null}
                      <DayQuestionIndicator day={summary} />
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {summary && summary.appointmentCount > 0 ? (
                      <span className="text-[9px] text-muted-foreground">
                        {summary.appointmentCount} ap.
                      </span>
                    ) : summary?.pendingQuestions ? (
                      <span className="text-[9px] font-medium text-amber-700 dark:text-amber-300">
                        Só questionamento
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {agenda && view === "week" ? (
        <div className="grid gap-3 md:grid-cols-7">
          {weekDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const summary = daysByDate.get(key);
            const isToday = isSameDay(day, new Date());

            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                title={`Ver ${format(day, "EEEE, d 'de' MMMM", { locale: ptBR })}`}
                onClick={() => {
                  onReferenceDateChange(day);
                  onViewChange("day");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onReferenceDateChange(day);
                    onViewChange("day");
                  }
                }}
                className={cn(
                  "flex min-h-[220px] cursor-pointer flex-col rounded-xl border border-border bg-card p-2 text-left transition hover:bg-muted/25",
                  isToday && "ring-2 ring-primary/40",
                  summary?.pendingQuestions && "border-amber-500/50",
                )}
              >
                <div className="mb-2 border-b border-border pb-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {format(day, "EEE", { locale: ptBR })}
                  </p>
                  <p className="text-lg font-bold text-foreground">
                    {format(day, "d")}
                  </p>
                  <p className="text-xs font-semibold text-primary">
                    {summary?.totalHoursFormatted ?? "00:00"}
                  </p>
                  <DayQuestionIndicator day={summary} compact />
                </div>
                <ul className="flex-1 space-y-1 overflow-y-auto">
                  {(summary?.entries ?? []).map((entry) => (
                    <CompanyEntryCard key={`${entry.source}:${entry.ref}`} entry={entry} dense />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}

      {agenda && view === "day" ? (
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm text-muted-foreground">Dia selecionado</p>
            <p className="font-semibold capitalize text-foreground">
              {format(referenceDate, "EEEE, d 'de' MMMM yyyy", { locale: ptBR })}
            </p>
            <p className="text-lg font-bold text-primary">
              {selectedDay.totalHoursFormatted}
            </p>
            <p className="text-xs text-muted-foreground">
              {selectedDay.appointmentCount} apontamento(s)
              {selectedDay.pendingQuestions > 0
                ? ` · ${selectedDay.pendingQuestions} aguardando resposta`
                : ""}
            </p>
          </div>
          <ul className="space-y-2 p-4">
            {selectedDay.entries.length === 0 ? (
              <li className="py-8 text-center text-sm text-muted-foreground">
                Nenhum apontamento neste dia.
              </li>
            ) : (
              selectedDay.entries.map((entry) => (
                <CompanyEntryCard
                  key={`${entry.source}:${entry.ref}`}
                  entry={entry}
                  isClientUser={isClientUser}
                  isAdmin={isAdmin}
                  onQuestion={onQuestion ? () => onQuestion(entry) : undefined}
                  onAnswer={onAnswer ? () => onAnswer(entry) : undefined}
                />
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
