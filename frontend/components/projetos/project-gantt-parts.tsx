"use client";

import { useMemo } from "react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  Diamond,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type {
  ProjectActivity,
  ProjectActivityKind,
  ProjectActivityStatus,
} from "@/lib/services/projetos.service";
import {
  PROJECT_ACTIVITY_STATUS_LABELS,
  PROJECT_ACTIVITY_STATUS_STYLES,
} from "@/lib/services/projetos.service";
import { cn } from "@/lib/utils";

function resolveActivityKind(row: ProjectActivity): ProjectActivityKind {
  if (row.kind) return row.kind;
  if (row.level === 1 && !row.parentId) return "PHASE";
  if (row.isMilestone) return "MILESTONE";
  return "TASK";
}

function isPhaseRow(row: ProjectActivity): boolean {
  return resolveActivityKind(row) === "PHASE";
}

function activityStatus(row: ProjectActivity): ProjectActivityStatus {
  return row.activityStatus ?? (row.progressPercent >= 100 ? "COMPLETED" : row.progressPercent > 0 ? "IN_PROGRESS" : "NOT_STARTED");
}

function ActivityStatusBadge({ row }: { row: ProjectActivity }) {
  const status = activityStatus(row);
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap",
        PROJECT_ACTIVITY_STATUS_STYLES[status],
      )}
    >
      {PROJECT_ACTIVITY_STATUS_LABELS[status]}
    </span>
  );
}

type FlatActivity = ProjectActivity & {
  depth: number;
  hasChildren: boolean;
  isLastChild: boolean;
};

function flattenWithDepth(
  nodes: ProjectActivity[],
  depth = 0,
): FlatActivity[] {
  const result: FlatActivity[] = [];
  const list = Array.isArray(nodes) ? nodes : [];
  list.forEach((node, index) => {
    const children = Array.isArray(node.children) ? node.children : [];
    result.push({
      ...node,
      depth,
      hasChildren: children.length > 0,
      isLastChild: index === list.length - 1,
    });
    if (children.length) {
      result.push(...flattenWithDepth(children, depth + 1));
    }
  });
  return result;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = parseISO(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatShortDate(value: string | null): string {
  const d = parseDate(value);
  return d ? format(d, "dd/MM", { locale: ptBR }) : "—";
}

/** Indentação com guias de árvore + ícone do tipo da atividade. */
function ActivityLabel({ row }: { row: FlatActivity }) {
  const done = row.progressPercent >= 100;
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: row.depth }).map((_, i) => (
        <span
          key={i}
          className="inline-block w-3 shrink-0 self-stretch border-l border-border/60"
          aria-hidden
        />
      ))}
      <span className="flex items-center gap-1.5 min-w-0">
        {row.isMilestone || resolveActivityKind(row) === "MILESTONE" ? (
          <Diamond className="size-3.5 shrink-0 text-amber-500" />
        ) : isPhaseRow(row) || row.hasChildren ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : done ? (
          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
        ) : (
          <Circle className="size-3 shrink-0 text-muted-foreground/60" />
        )}
        <span
          className={cn(
            "truncate",
            row.hasChildren ? "font-semibold text-foreground" : "text-foreground/90",
            done && !row.hasChildren && "text-muted-foreground line-through",
          )}
          title={row.name}
        >
          <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">
            {row.wbsCode}
          </span>
          {row.name}
        </span>
      </span>
    </div>
  );
}

export function ProjectGanttChart({
  activities,
  activityNameById,
}: {
  activities: ProjectActivity[];
  activityNameById: Map<string, string>;
}) {
  const flat = useMemo(() => flattenWithDepth(activities), [activities]);

  const range = useMemo(() => {
    let min: Date | null = null;
    let max: Date | null = null;
    for (const row of flat) {
      const start = parseDate(row.startDate);
      const end = parseDate(row.endDate) ?? start;
      if (start && (!min || start < min)) min = start;
      if (end && (!max || end > max)) max = end;
    }
    if (!min || !max) {
      const today = new Date();
      min = today;
      max = addDays(today, 14);
    } else {
      min = addDays(min, -1);
      max = addDays(max, 2);
    }
    const totalDays = Math.max(1, differenceInCalendarDays(max, min) + 1);
    return { min, max, totalDays };
  }, [flat]);

  const dayTicks = useMemo(() => {
    const ticks: Date[] = [];
    for (let i = 0; i < range.totalDays; i += 1) {
      ticks.push(addDays(range.min, i));
    }
    return ticks;
  }, [range]);

  if (!flat.length) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        Adicione atividades para visualizar o cronograma.
      </div>
    );
  }

  const gridTemplate = `260px repeat(${range.totalDays}, minmax(30px, 1fr))`;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[920px]">
            <div
              className="grid border-b bg-muted/40 text-xs text-muted-foreground"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div className="px-3 py-2 font-medium sticky left-0 bg-muted/40 z-10 border-r">
                Atividade
              </div>
              {dayTicks.map((day) => {
                const weekend = [0, 6].includes(day.getDay());
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "px-1 py-2 text-center border-l",
                      weekend && "bg-muted/60",
                    )}
                  >
                    <div className="font-medium">{format(day, "dd", { locale: ptBR })}</div>
                    <div className="text-[10px]">{format(day, "MMM", { locale: ptBR })}</div>
                  </div>
                );
              })}
            </div>

            {flat.map((row) => {
              const start = parseDate(row.startDate);
              const end = parseDate(row.endDate) ?? start;
              const leftPct =
                start != null
                  ? (differenceInCalendarDays(start, range.min) / range.totalDays) * 100
                  : 0;
              const widthPct =
                start && end
                  ? ((Math.max(1, differenceInCalendarDays(end, start) + 1)) /
                      range.totalDays) *
                    100
                  : row.isMilestone
                    ? 0.8
                    : 4;
              const progress = Math.min(100, Math.max(0, row.progressPercent));
              const done = progress >= 100;

              return (
                <div
                  key={row.id}
                  className={cn(
                    "grid border-b last:border-b-0 min-h-[58px] items-center",
                    row.hasChildren && "bg-muted/20",
                  )}
                  style={{ gridTemplateColumns: gridTemplate }}
                >
                  <div
                    className="px-3 py-2 text-sm sticky left-0 bg-card z-10 border-r"
                    style={{
                      backgroundColor: row.hasChildren
                        ? "color-mix(in oklab, var(--muted) 20%, var(--card))"
                        : undefined,
                    }}
                  >
                    <ActivityLabel row={row} />
                  </div>
                  <div
                    className="relative col-span-full h-full"
                    style={{ gridColumn: `2 / span ${range.totalDays}` }}
                  >
                    {start ? (
                      row.isMilestone ? (
                        <div
                          className="absolute top-3 -translate-x-1/2"
                          style={{ left: `${leftPct}%` }}
                          title={`Marco · ${formatShortDate(row.startDate)}`}
                        >
                          <Diamond className="size-4 fill-amber-500 text-amber-500" />
                        </div>
                      ) : row.hasChildren ? (
                        <div
                          className="absolute top-5 h-2 rounded-sm bg-foreground/30"
                          style={{
                            left: `${leftPct}%`,
                            width: `${Math.max(2, widthPct)}%`,
                          }}
                          title={`${formatShortDate(row.startDate)} → ${formatShortDate(row.endDate)}`}
                        />
                      ) : (
                        <div
                          className={cn(
                            "absolute top-2.5 h-6 rounded-md overflow-hidden shadow-sm border",
                            done
                              ? "border-emerald-500/40 bg-emerald-500/15"
                              : "border-primary/30 bg-primary/15",
                          )}
                          style={{
                            left: `${leftPct}%`,
                            width: `${Math.max(2, widthPct)}%`,
                          }}
                          title={`${formatShortDate(row.startDate)} → ${formatShortDate(row.endDate)} · ${progress}%`}
                        >
                          <div
                            className={cn(
                              "absolute inset-y-0 left-0",
                              done ? "bg-emerald-500/80" : "bg-primary/80",
                            )}
                            style={{ width: `${progress}%` }}
                          />
                          <span className="absolute inset-0 flex items-center gap-1 px-2 text-[10px] font-medium text-foreground truncate">
                            {done ? <CheckCircle2 className="size-3 shrink-0" /> : null}
                            {row.assigneeDisplayName ?? ""}
                          </span>
                        </div>
                      )
                    ) : null}
                    {row.predecessorIds?.length ? (
                      <div className="absolute bottom-1 left-2 right-2 truncate text-[10px] text-muted-foreground/80">
                        ←{" "}
                        {row.predecessorIds
                          .map((id) => activityNameById.get(id) ?? id.slice(0, 6))
                          .join(", ")}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm border border-primary/30 bg-primary/80" />
          Em andamento
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm border border-emerald-500/40 bg-emerald-500/80" />
          Concluída
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-5 rounded-sm bg-foreground/30" />
          Grupo (pai)
        </span>
        <span className="flex items-center gap-1.5">
          <Diamond className="size-3 fill-amber-500 text-amber-500" />
          Marco
        </span>
        <span className="flex items-center gap-1.5">
          ← Predecessora (depende de)
        </span>
      </div>
    </div>
  );
}

export function ProjectActivityTable({
  activities,
  canEdit,
  hideDurations = false,
  onEdit,
  onAddChild,
  onDelete,
  onToggleDone,
  onLogTime,
}: {
  activities: ProjectActivity[];
  canEdit: boolean;
  hideDurations?: boolean;
  onEdit: (activity: ProjectActivity) => void;
  onAddChild: (parent: ProjectActivity) => void;
  onDelete: (activity: ProjectActivity) => void;
  onToggleDone: (activity: ProjectActivity, done: boolean) => void;
  onLogTime?: (activity: ProjectActivity) => void;
}) {
  const flat = useMemo(() => flattenWithDepth(activities), [activities]);

  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 text-center font-medium w-12">Feita</th>
              <th className="px-3 py-2.5 text-left font-medium">Tarefa</th>
              <th className="px-3 py-2.5 text-left font-medium w-28">Status</th>
              <th className="px-3 py-2.5 text-left font-medium min-w-[140px]">Predecessoras</th>
              {!hideDurations ? (
                <th className="px-3 py-2.5 text-left font-medium">Horas</th>
              ) : null}
              <th className="px-3 py-2.5 text-left font-medium">Início</th>
              <th className="px-3 py-2.5 text-left font-medium">Término</th>
              <th className="px-3 py-2.5 text-left font-medium">Responsável</th>
              {!hideDurations ? (
                <th className="px-3 py-2.5 text-left font-medium">Real</th>
              ) : null}
              <th className="px-3 py-2.5 text-left font-medium">Apontamentos</th>
              <th className="px-3 py-2.5 text-left font-medium">Andamento</th>
              {canEdit ? (
                <th className="px-3 py-2.5 text-right font-medium">Ações</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {flat.map((row) => {
              const done = row.progressPercent >= 100;
              const phase = isPhaseRow(row);
              const canStart = row.canStart ?? row.predecessorsComplete ?? true;
              const predecessors = row.predecessors ?? [];
              const blockedLabel = predecessors
                .filter((p) => !p.completed)
                .map((p) => p.wbsCode)
                .join(", ");
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "border-t hover:bg-accent/20 transition-colors",
                    row.hasChildren && "bg-muted/20",
                  )}
                >
                  <td className="px-3 py-2 text-center">
                    {row.isMilestone || resolveActivityKind(row) === "MILESTONE" ? (
                      <Diamond className="mx-auto size-4 text-amber-500" />
                    ) : phase ? (
                      <span className="text-muted-foreground/40">—</span>
                    ) : (
                      <button
                        type="button"
                        disabled={!canEdit || (!done && !canStart)}
                        onClick={() => onToggleDone(row, !done)}
                        className={cn(
                          "inline-flex items-center justify-center rounded-full transition",
                          canEdit && (done || canStart)
                            ? "hover:scale-110 cursor-pointer"
                            : "cursor-not-allowed opacity-50",
                        )}
                        title={
                          !done && !canStart
                            ? `Conclua as predecessoras: ${blockedLabel}`
                            : done
                              ? "Marcar como não concluída"
                              : "Marcar como concluída"
                        }
                      >
                        {done ? (
                          <CheckCircle2 className="size-5 text-emerald-500" />
                        ) : (
                          <Circle className="size-5 text-muted-foreground/50" />
                        )}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <ActivityLabel row={row} />
                  </td>
                  <td className="px-3 py-2">
                    <ActivityStatusBadge row={row} />
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-muted-foreground max-w-[180px]">
                    {phase ? (
                      <span>—</span>
                    ) : predecessors.length === 0 ? (
                      <span>—</span>
                    ) : (
                      <div className="space-y-1">
                        {predecessors.map((pred) => (
                          <div
                            key={pred.id}
                            className={cn(
                              "truncate",
                              pred.completed ? "text-emerald-600" : "text-amber-700",
                            )}
                            title={pred.name}
                          >
                            {pred.wbsCode} {pred.completed ? "✓" : "○"}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  {!hideDurations ? (
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {phase || row.isMilestone
                        ? "—"
                        : `${row.durationHours ?? (row.durationDays != null ? row.durationDays * 8 : 0)}h`}
                    </td>
                  ) : null}
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {formatShortDate(row.startDate)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {formatShortDate(row.endDate)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.assigneeDisplayName ?? "—"}
                  </td>
                  {!hideDurations ? (
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {row.actualDurationHours != null
                        ? `${row.actualDurationHours}h`
                        : row.actualDurationDays != null
                          ? `${row.actualDurationDays * 8}h`
                          : "—"}
                    </td>
                  ) : null}
                  <td className="px-3 py-2 align-top">
                    {(row.appointments ?? []).length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="space-y-2 max-w-[260px]">
                        {(row.appointments ?? []).map((item) => (
                          <div key={item.id} className="rounded-md bg-muted/30 px-2 py-1.5">
                            <p className="text-xs font-medium text-foreground">
                              {formatShortDate(item.appointmentDate)} · {item.initTime}–
                              {item.endTime}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {item.authorName}
                            </p>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {item.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            done ? "bg-emerald-500" : "bg-primary",
                          )}
                          style={{ width: `${row.progressPercent}%` }}
                        />
                      </div>
                      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                        {row.progressPercent}%
                      </span>
                    </div>
                  </td>
                  {canEdit ? (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={() => onEdit(row)}
                          title="Editar"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        {phase ? (
                        <button
                          type="button"
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={() => onAddChild(row)}
                          title="Adicionar atividade"
                        >
                          <Plus className="size-3.5" />
                        </button>
                        ) : onLogTime ? (
                        <button
                          type="button"
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={() => onLogTime(row)}
                          title="Apontar tempo"
                        >
                          <Clock className="size-3.5" />
                        </button>
                        ) : null}
                        <button
                          type="button"
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500"
                          onClick={() => onDelete(row)}
                          title={phase ? "Excluir fase" : "Excluir"}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ProjectProgressHeader({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Andamento geral do projeto</span>
        <span className="text-lg font-semibold text-primary">{pct}%</span>
      </div>
      <div className="h-3 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full bg-primary transition-all")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
