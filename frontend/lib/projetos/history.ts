export type ProjectHistoryEventType =
  | "PROJECT_CREATED"
  | "PROJECT_UPDATED"
  | "PROJECT_REOPENED"
  | "PROJECT_CLOSED"
  | "PHASE_CREATED"
  | "PHASE_UPDATED"
  | "PHASE_DELETED"
  | "TASK_CREATED"
  | "TASK_UPDATED"
  | "TASK_COMPLETED"
  | "TASK_DELETED"
  | "APPOINTMENT_LINKED";

export type ProjectHistoryFilter =
  | "ALL"
  | "PROJECT"
  | "PHASE"
  | "TASK"
  | "APPOINTMENT";

export type ProjectHistoryEntry = {
  id: string;
  eventType: ProjectHistoryEventType | string;
  summary: string;
  actorName: string | null;
  createdAt: string;
  payload?: unknown;
};

export const PROJECT_HISTORY_FILTER_OPTIONS: Array<{
  value: ProjectHistoryFilter;
  label: string;
}> = [
  { value: "ALL", label: "Todos" },
  { value: "PROJECT", label: "Projeto" },
  { value: "PHASE", label: "Fases" },
  { value: "TASK", label: "Atividades" },
  { value: "APPOINTMENT", label: "Apontamentos" },
];

const EVENT_LABELS: Record<string, string> = {
  PROJECT_CREATED: "Projeto criado",
  PROJECT_UPDATED: "Projeto alterado",
  PROJECT_REOPENED: "Projeto reaberto",
  PROJECT_CLOSED: "Projeto fechado",
  PHASE_CREATED: "Fase criada",
  PHASE_UPDATED: "Fase alterada",
  PHASE_DELETED: "Fase excluída",
  TASK_CREATED: "Atividade criada",
  TASK_UPDATED: "Atividade alterada",
  TASK_COMPLETED: "Atividade concluída",
  TASK_DELETED: "Atividade excluída",
  APPOINTMENT_LINKED: "Apontamento",
};

export function projectHistoryEventLabel(eventType: string, summary: string): string {
  if (eventType === "APPOINTMENT_LINKED" && summary.toLowerCase().includes("desvinculado")) {
    return "Apontamento desvinculado";
  }
  return EVENT_LABELS[eventType] ?? eventType.replaceAll("_", " ").toLowerCase();
}

export function projectHistoryFilterCategory(
  eventType: string,
): Exclude<ProjectHistoryFilter, "ALL"> {
  if (eventType.startsWith("PROJECT_")) return "PROJECT";
  if (eventType.startsWith("PHASE_")) return "PHASE";
  if (eventType.startsWith("TASK_")) return "TASK";
  return "APPOINTMENT";
}

export function filterProjectHistory(
  rows: ProjectHistoryEntry[],
  filter: ProjectHistoryFilter,
  search: string,
): ProjectHistoryEntry[] {
  const q = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter !== "ALL" && projectHistoryFilterCategory(row.eventType) !== filter) {
      return false;
    }
    if (!q) return true;
    const haystack = [
      row.summary,
      row.actorName ?? "",
      projectHistoryEventLabel(row.eventType, row.summary),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export type ProjectHistoryTone =
  | "project"
  | "phase"
  | "task"
  | "appointment"
  | "success"
  | "danger";

export function projectHistoryTone(eventType: string, summary: string): ProjectHistoryTone {
  if (eventType === "TASK_COMPLETED") return "success";
  if (eventType.endsWith("_DELETED")) return "danger";
  if (eventType === "APPOINTMENT_LINKED" && summary.toLowerCase().includes("desvinculado")) {
    return "appointment";
  }
  const category = projectHistoryFilterCategory(eventType);
  if (category === "PROJECT") return "project";
  if (category === "PHASE") return "phase";
  if (category === "TASK") return "task";
  return "appointment";
}
