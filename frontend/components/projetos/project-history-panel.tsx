"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CheckCircle2,
  Clock,
  FileDown,
  FolderKanban,
  History,
  Layers,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { notifyError } from "@/lib/notify";
import {
  filterProjectHistory,
  PROJECT_HISTORY_FILTER_OPTIONS,
  projectHistoryEventLabel,
  projectHistoryTone,
  type ProjectHistoryEntry,
  type ProjectHistoryFilter,
  type ProjectHistoryTone,
} from "@/lib/projetos/history";
import { projetosService } from "@/lib/services/projetos.service";

function formatHistoryWhen(value: string): string {
  const d = parseISO(value);
  if (Number.isNaN(d.getTime())) return value;
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

function toneDotClass(tone: ProjectHistoryTone): string {
  switch (tone) {
    case "success":
      return "bg-emerald-500";
    case "danger":
      return "bg-rose-500";
    case "project":
      return "bg-sky-500";
    case "phase":
      return "bg-violet-500";
    case "task":
      return "bg-primary";
    case "appointment":
      return "bg-amber-500";
  }
}

function toneCardClass(tone: ProjectHistoryTone): string {
  switch (tone) {
    case "success":
      return "border-emerald-500/25 bg-emerald-500/5";
    case "danger":
      return "border-rose-500/25 bg-rose-500/5";
    case "project":
      return "border-sky-500/25 bg-sky-500/5";
    case "phase":
      return "border-violet-500/25 bg-violet-500/5";
    case "task":
      return "border-primary/25 bg-primary/5";
    case "appointment":
      return "border-amber-500/25 bg-amber-500/5";
  }
}

function HistoryIcon({
  eventType,
  summary,
}: {
  eventType: string;
  summary: string;
}) {
  if (eventType.endsWith("_DELETED")) {
    return <Trash2 className="h-4 w-4" />;
  }
  if (eventType === "TASK_COMPLETED") {
    return <CheckCircle2 className="h-4 w-4" />;
  }
  if (eventType.startsWith("PHASE_")) {
    return <Layers className="h-4 w-4" />;
  }
  if (eventType.startsWith("TASK_")) {
    return <Clock className="h-4 w-4" />;
  }
  if (eventType === "APPOINTMENT_LINKED") {
    return <Link2 className="h-4 w-4" />;
  }
  if (summary.toLowerCase().includes("desvinculado")) {
    return <Link2 className="h-4 w-4" />;
  }
  return <FolderKanban className="h-4 w-4" />;
}

type Props = {
  projectId: string;
  refreshToken?: number;
};

export function ProjectHistoryPanel({ projectId, refreshToken = 0 }: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<ProjectHistoryEntry[]>([]);
  const [filter, setFilter] = useState<ProjectHistoryFilter>("ALL");
  const [search, setSearch] = useState("");
  const [exportingPdf, setExportingPdf] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!projectId) return;
      try {
        if (silent) setRefreshing(true);
        else setLoading(true);
        const data = await projetosService.getProjectHistory(projectId);
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
    [projectId],
  );

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const filtered = useMemo(
    () => filterProjectHistory(rows, filter, search),
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
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <History className="h-5 w-5 text-primary" />
          Histórico do projeto
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={exportingPdf || loading}
            onClick={async () => {
              try {
                setExportingPdf(true);
                await projetosService.exportProjectHistoryPdf(projectId);
              } catch (err) {
                notifyError(
                  err instanceof Error
                    ? err.message
                    : "Não foi possível exportar o PDF.",
                );
              } finally {
                setExportingPdf(false);
              }
            }}
          >
            {exportingPdf ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="mr-1.5 h-3.5 w-3.5" />
            )}
            Exportar PDF
          </Button>
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
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          {PROJECT_HISTORY_FILTER_OPTIONS.map((option) => (
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
            const tone = projectHistoryTone(entry.eventType, entry.summary);
            const label = projectHistoryEventLabel(entry.eventType, entry.summary);
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
                  <HistoryIcon eventType={entry.eventType} summary={entry.summary} />
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
    </section>
  );
}
