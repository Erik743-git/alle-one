"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  Clock,
  FolderKanban,
  History,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  Ticket,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { notifyError } from "@/lib/notify";
import {
  filterTicketHistory,
  TICKET_HISTORY_FILTER_OPTIONS,
  ticketHistoryEventLabel,
  ticketHistoryTone,
  type TicketHistoryEntry,
  type TicketHistoryFilter,
  type TicketHistoryTone,
} from "@/lib/tickets/history";
import { ticketsService } from "@/lib/services/tickets.service";

function formatHistoryWhen(value: string): string {
  const d = parseISO(value);
  if (Number.isNaN(d.getTime())) return value;
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

function toneDotClass(tone: TicketHistoryTone): string {
  switch (tone) {
    case "stage":
      return "bg-violet-500";
    case "gmud":
      return "bg-amber-500";
    case "project":
      return "bg-emerald-500";
    case "appointment":
      return "bg-primary";
    case "warning":
      return "bg-amber-500";
    case "ticket":
      return "bg-sky-500";
  }
}

function toneCardClass(tone: TicketHistoryTone): string {
  switch (tone) {
    case "stage":
      return "border-violet-500/25 bg-violet-500/5";
    case "gmud":
      return "border-amber-500/25 bg-amber-500/5";
    case "project":
      return "border-emerald-500/25 bg-emerald-500/5";
    case "appointment":
      return "border-primary/25 bg-primary/5";
    case "warning":
      return "border-amber-500/30 bg-amber-500/10";
    case "ticket":
      return "border-sky-500/25 bg-sky-500/5";
  }
}

function HistoryIcon({ eventType }: { eventType: string }) {
  if (
    eventType === "APPOINTMENT_WARNING_CREATED" ||
    eventType === "APPOINTMENT_WARNING_ACKNOWLEDGED"
  ) {
    return <AlertTriangle className="h-4 w-4" />;
  }
  if (eventType.includes("APPOINTMENT")) return <Clock className="h-4 w-4" />;
  if (eventType.startsWith("PROJECT_")) return <FolderKanban className="h-4 w-4" />;
  if (eventType.startsWith("GMUD_")) return <Link2 className="h-4 w-4" />;
  if (
    eventType === "STAGE_CHANGED" ||
    eventType === "TICKET_REOPENED" ||
    eventType === "TICKET_CLOSED" ||
    eventType === "TICKET_CANCELLED"
  ) {
    return <Ticket className="h-4 w-4" />;
  }
  return <History className="h-4 w-4" />;
}

type Props = {
  ticketNumber: number;
  refreshToken?: number;
};

export function TicketHistoryPanel({ ticketNumber, refreshToken = 0 }: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<TicketHistoryEntry[]>([]);
  const [filter, setFilter] = useState<TicketHistoryFilter>("ALL");
  const [search, setSearch] = useState("");

  const load = useCallback(
    async (silent = false) => {
      if (!Number.isFinite(ticketNumber)) return;
      try {
        if (silent) setRefreshing(true);
        else setLoading(true);
        const data = await ticketsService.getTicketHistory(ticketNumber);
        setRows(data);
      } catch (err) {
        notifyError(
          err instanceof Error ? err.message : "Não foi possível carregar o histórico.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [ticketNumber],
  );

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const filtered = useMemo(
    () => filterTicketHistory(rows, filter, search),
    [filter, rows, search],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border bg-card py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando histórico...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <History className="h-5 w-5 text-primary" />
          Histórico do ticket
        </h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={refreshing}
          onClick={() => void load(true)}
        >
          <RefreshCw
            className={cn("mr-1.5 h-3.5 w-3.5", refreshing && "animate-spin")}
          />
          Atualizar
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          {TICKET_HISTORY_FILTER_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={filter === option.value ? "default" : "outline"}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar no histórico..."
            className="pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/10 px-6 py-12 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? "Nenhum evento registrado ainda."
            : "Nenhum evento corresponde aos filtros."}
        </div>
      ) : (
        <ol className="relative space-y-0">
          {filtered.map((entry, index) => {
            const tone = ticketHistoryTone(entry.eventType);
            const label = ticketHistoryEventLabel(entry.eventType);
            const isLast = index === filtered.length - 1;

            return (
              <li key={entry.id} className="relative flex gap-4 pb-6">
                {!isLast ? (
                  <span
                    aria-hidden
                    className="absolute left-[15px] top-8 bottom-0 w-px bg-border"
                  />
                ) : null}
                <span
                  className={cn(
                    "relative z-[1] mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-foreground",
                    toneCardClass(tone),
                  )}
                >
                  <span
                    className={cn(
                      "absolute -left-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card",
                      toneDotClass(tone),
                    )}
                  />
                  <HistoryIcon eventType={entry.eventType} />
                </span>
                <article
                  className={cn(
                    "min-w-0 flex-1 rounded-xl border px-4 py-3",
                    toneCardClass(tone),
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{label}</p>
                    <time
                      className="shrink-0 text-xs text-muted-foreground"
                      dateTime={entry.createdAt}
                    >
                      {formatHistoryWhen(entry.createdAt)}
                    </time>
                  </div>
                  <p className="mt-1 text-sm text-foreground/90">{entry.summary}</p>
                  {entry.actorName ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      por {entry.actorName}
                    </p>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
