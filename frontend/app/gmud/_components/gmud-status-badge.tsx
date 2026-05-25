"use client";

import { cn } from "@/lib/utils";
import type { GmudStatus } from "@/lib/services/gmuds.service";

const STATUS_META: Record<
  GmudStatus,
  { label: string; className: string }
> = {
  DRAFT: {
    label: "Rascunho",
    className: "alle-badge-neutral",
  },
  PENDING_APPROVAL: {
    label: "Pendente de aprovação",
    className: "alle-badge-warning",
  },
  APPROVED: {
    label: "Aprovada",
    className: "alle-badge-success",
  },
  IN_EXECUTION: {
    label: "Em execução",
    className: "alle-badge-info",
  },
  EXECUTED: {
    label: "Executada",
    className: "alle-badge-teal",
  },
  REJECTED: {
    label: "Rejeitada",
    className: "alle-badge-danger",
  },
  CANCELED: {
    label: "Cancelada",
    className: "alle-badge-neutral",
  },
};

export function GmudStatusBadge({ status }: { status: GmudStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        meta.className
      )}
      title={meta.label}
    >
      {meta.label}
    </span>
  );
}
