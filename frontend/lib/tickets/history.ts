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
  TICKET_UPDATED: "Ticket atualizado",
  TICKET_REOPENED: "Chamado reaberto",
  TICKET_CLOSED: "Chamado encerrado",
  TICKET_CANCELLED: "Chamado cancelado",
  EMAIL_REPLY: "Resposta por e-mail",
  APPOINTMENT_CREATED: "Apontamento registrado",
  APPOINTMENT_UPDATED: "Apontamento alterado",
  APPOINTMENT_DELETED: "Apontamento excluído",
  APPOINTMENT_TIFLUX: "Apontamento histórico",
  STAGE_CHANGED: "Estágio alterado",
  RESPONSIBLE_CHANGED: "Responsável alterado",
  DESK_CHANGED: "Chamado transferido",
  TICKET_GROUPED: "Chamado agrupado",
  COMMUNICATION_UPDATED: "Comunicação alterada",
  COMMUNICATION_REMOVED: "Comunicação removida",
  GMUD_LINKED: "GMUD vinculada",
  GMUD_UPDATED: "GMUD atualizada",
  PROJECT_LINKED: "Projeto vinculado",
  PROJECT_APPOINTMENT_LINKED: "Apontamento no projeto",
  TIFLUX_EVENT: "Evento do ticket",
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
  if (
    eventType === "STAGE_CHANGED" ||
    eventType === "RESPONSIBLE_CHANGED" ||
    eventType === "DESK_CHANGED" ||
    eventType === "TICKET_GROUPED" ||
    eventType === "TIFLUX_EVENT" ||
    eventType === "TICKET_UPDATED" ||
    eventType === "TICKET_REOPENED" ||
    eventType === "TICKET_CLOSED" ||
    eventType === "TICKET_CANCELLED" ||
    eventType === "EMAIL_REPLY" ||
    eventType === "COMMUNICATION_UPDATED" ||
    eventType === "COMMUNICATION_REMOVED"
  ) {
    return "TICKET";
  }
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
  if (
    eventType === "STAGE_CHANGED" ||
    eventType === "TICKET_REOPENED" ||
    eventType === "TICKET_CLOSED" ||
    eventType === "TICKET_CANCELLED" ||
    eventType === "TICKET_GROUPED" ||
    eventType === "DESK_CHANGED"
  ) {
    return "stage";
  }
  if (eventType.startsWith("GMUD_")) return "gmud";
  if (eventType.startsWith("PROJECT_")) return "project";
  if (eventType.includes("APPOINTMENT")) return "appointment";
  return "ticket";
}
