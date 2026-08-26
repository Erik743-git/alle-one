const PT_BR = "pt-BR";

/** ISO date (yyyy-MM-dd) → dd/mm/yyyy */
export function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Data legível (pt-BR) a partir de ISO ou Date. */
export function formatDateDisplay(
  value: string | Date | null | undefined,
  fallback = "—",
): string {
  if (value == null || value === "") return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString(PT_BR);
}

/** Data e hora legíveis (pt-BR). */
export function formatDateTime(
  value: string | Date | null | undefined,
  fallback?: string,
): string {
  if (value == null || value === "") {
    return fallback ?? "—";
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return typeof value === "string" ? value : (fallback ?? "—");
  }
  return d.toLocaleString(PT_BR);
}

/** Data/hora de aprovação com hora explícita. */
export function formatApprovedAt(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(PT_BR, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
