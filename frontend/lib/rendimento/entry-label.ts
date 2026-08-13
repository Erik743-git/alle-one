/** Rótulo curto: #número · título · cliente */
export function formatRendimentoTicketRef(entry: {
  ticketNumber: number;
  ticketTitle?: string | null;
  clientName?: string | null;
}): string {
  const title = entry.ticketTitle?.trim() || "";
  const client = entry.clientName?.trim() || "";
  return [`#${entry.ticketNumber}`, title || null, client || null]
    .filter(Boolean)
    .join(" · ");
}

/** Mesmo rótulo com prefixo "Ticket". */
export function formatRendimentoTicketLine(entry: {
  ticketNumber: number;
  ticketTitle?: string | null;
  clientName?: string | null;
}): string {
  return `Ticket ${formatRendimentoTicketRef(entry)}`;
}
