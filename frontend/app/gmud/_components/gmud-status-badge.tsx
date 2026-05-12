"use client";

import { cn } from "@/lib/utils";
import type { GmudStatus } from "@/lib/services/gmuds.service";

const STATUS_META: Record<
  GmudStatus,
  { label: string; className: string }
> = {
  DRAFT: {
    label: "Rascunho",
    className: "bg-slate-500/15 text-slate-200 border border-slate-400/20",
  },
  PENDING_APPROVAL: {
    label: "Pendente de aprovação",
    className: "bg-orange-500/15 text-orange-200 border border-orange-400/20",
  },
  APPROVED: {
    label: "Aprovada",
    className: "bg-emerald-500/15 text-emerald-200 border border-emerald-400/20",
  },
  IN_EXECUTION: {
    label: "Em execução",
    className: "bg-blue-500/15 text-blue-200 border border-blue-400/20",
  },
  EXECUTED: {
    label: "Executada",
    className: "bg-teal-500/15 text-teal-200 border border-teal-400/20",
  },
  REJECTED: {
    label: "Rejeitada",
    className: "bg-red-500/15 text-red-200 border border-red-400/20",
  },
  CANCELED: {
    label: "Cancelada",
    className: "bg-zinc-500/15 text-zinc-200 border border-zinc-400/20",
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

