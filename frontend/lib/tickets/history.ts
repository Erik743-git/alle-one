export type TicketHistoryFilter =
  | "ALL"
  | "TICKET"
  | "APPOINTMENT"
  | "PROJECT"
  | "GMUD";

export type TicketHistoryEntry = {
  id: string;
  eventType: string;
  summary: string;
  actorName: string | null;
  createdAt: string;
};

export const TICKET_HISTORY_FILTER_OPTIONS: Array<{
  value: TicketHistoryFilter;
  label: string;
}> = [
  { value: "ALL", label: "Todos" },
  { value: "TICKET", label: "Ticket" },
  { value: "APPOINTMENT", label: "Apontamentos" },
  { value: "PROJECT", label: "Projeto" },
  { value: "GMUD", label: "GMUD" },
];

const EVENT_LABELS: Record<string, string> = {
  TICKET_CREATED: "Ticket criado",
  APPOINTMENT_CREATED: "Apontamento registrado",
  STAGE_CHANGED: "Estágio alterado",
  GMUD_LINKED: "GMUD vinculada",
  GMUD_UPDATED: "GMUD atualizada",
  PROJECT_LINKED: "Projeto vinculado",
  PROJECT_APPOINTMENT_LINKED: "Apontamento no projeto",
};

export function ticketHistoryEventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType.replaceAll("_", " ").toLowerCase();
}

export function ticketHistoryFilterCategory(
  eventType: string,
): Exclude<TicketHistoryFilter, "ALL"> {
  if (eventType.startsWith("GMUD_")) return "GMUD";
  if (eventType.startsWith("PROJECT_")) return "PROJECT";
  if (eventType.includes("APPOINTMENT")) return "APPOINTMENT";
  return "TICKET";
}

export function filterTicketHistory(
  rows: TicketHistoryEntry[],
  filter: TicketHistoryFilter,
  search: string,
): TicketHistoryEntry[] {
  const q = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter !== "ALL" && ticketHistoryFilterCategory(row.eventType) !== filter) {
      return false;
    }
    if (!q) return true;
    const haystack = [
      row.summary,
      row.actorName ?? "",
      ticketHistoryEventLabel(row.eventType),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export type TicketHistoryTone =
  | "ticket"
  | "appointment"
  | "project"
  | "gmud"
  | "stage";

export function ticketHistoryTone(eventType: string): TicketHistoryTone {
  if (eventType === "STAGE_CHANGED") return "stage";
  if (eventType.startsWith("GMUD_")) return "gmud";
  if (eventType.startsWith("PROJECT_")) return "project";
  if (eventType.includes("APPOINTMENT")) return "appointment";
  return "ticket";
}
