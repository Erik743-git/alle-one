export type BulkApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export type BulkApprovalStatusFilter = BulkApprovalStatus;

export type BulkApprovalRow = {
  id: string;
  status: BulkApprovalStatus;
};

export const DEFAULT_BULK_STATUS_FILTERS: BulkApprovalStatusFilter[] = [
  "PENDING",
];

export const BULK_APPROVAL_STATUS_OPTIONS: Array<{
  value: BulkApprovalStatusFilter;
  label: string;
}> = [
  { value: "PENDING", label: "Pendentes" },
  { value: "APPROVED", label: "Aprovadas" },
  { value: "REJECTED", label: "Rejeitadas" },
];

export function toggleBulkStatusFilter(
  current: BulkApprovalStatusFilter[],
  status: BulkApprovalStatusFilter,
  checked: boolean,
): BulkApprovalStatusFilter[] {
  if (checked) {
    if (current.includes(status)) return current;
    return [...current, status];
  }
  if (current.length <= 1) return current;
  return current.filter((entry) => entry !== status);
}

export function bulkApprovalListTitle(
  statusFilters: BulkApprovalStatusFilter[],
  items: BulkApprovalRow[],
): string {
  if (statusFilters.length === 1) {
    const count = items.length;
    switch (statusFilters[0]) {
      case "APPROVED":
        return `Aprovadas (${count})`;
      case "REJECTED":
        return `Rejeitadas (${count})`;
      default:
        return `Pendentes (${count})`;
    }
  }

  const parts = statusFilters.map((filter) => {
    const count = items.filter((row) => row.status === filter).length;
    const label =
      BULK_APPROVAL_STATUS_OPTIONS.find((option) => option.value === filter)
        ?.label ?? filter;
    return `${count} ${label.toLowerCase()}`;
  });

  return `Registros (${parts.join(", ")})`;
}

export function bulkApprovalEmptyMessage(
  statusFilters: BulkApprovalStatusFilter[],
  kind: "overtime" | "justification",
): string {
  if (statusFilters.length > 1) {
    return kind === "overtime"
      ? "Nenhum registro encontrado com os filtros de situação selecionados."
      : "Nenhuma justificativa encontrada com os filtros de situação selecionados.";
  }

  const statusFilter = statusFilters[0] ?? "PENDING";
  if (statusFilter === "APPROVED") {
    return kind === "overtime"
      ? "Nenhuma hora extra ou plantão aprovado no período."
      : "Nenhuma justificativa aprovada no período.";
  }
  if (statusFilter === "REJECTED") {
    return kind === "overtime"
      ? "Nenhuma hora extra ou plantão rejeitado no período."
      : "Nenhuma justificativa rejeitada no período.";
  }
  return kind === "overtime"
    ? "Nenhuma hora extra ou plantão pendente no período."
    : "Nenhuma justificativa pendente no período.";
}

export function includesPendingFilter(
  statusFilters: BulkApprovalStatusFilter[],
): boolean {
  return statusFilters.includes("PENDING");
}

export function isBulkRowDecided(status: BulkApprovalStatus): boolean {
  return status !== "PENDING";
}

export { formatApprovedAt, formatDateBr } from "@/lib/date-utils";

export function emailLocalPart(email: string) {
  const local = email.split("@")[0]?.trim();
  return local || email;
}

export function syncBulkSelection<T extends BulkApprovalRow>(
  data: T[],
  prev: Record<string, boolean>,
): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const row of data) {
    if (row.status !== "PENDING") {
      next[row.id] = true;
    } else if (prev[row.id]) {
      next[row.id] = true;
    }
  }
  return next;
}

export function pendingBulkRows<T extends BulkApprovalRow>(items: T[]): T[] {
  return items.filter((row) => row.status === "PENDING");
}
