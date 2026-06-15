"use client";

import Link from "next/link";
import { Ticket } from "lucide-react";

import { CompactExpandableText } from "@/components/ui/compact-expandable-text";
import { appointmentDescriptionToPlainText } from "@/lib/appointment-doc";
import type { PendingOvertimeItem } from "@/lib/services/rendimento.service";

type Props = {
  row: PendingOvertimeItem;
};

function resolvePlainDescription(row: PendingOvertimeItem) {
  const raw = row.description?.trim() || row.label?.trim() || "";
  if (!raw) return "";
  return appointmentDescriptionToPlainText(raw).trim() || raw;
}

export function OvertimeDescriptionCell({ row }: Props) {
  const plainText = resolvePlainDescription(row);
  const hasTicket = row.ticketNumber != null;
  const hasText = Boolean(plainText);

  if (!hasTicket && !hasText) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="max-w-sm space-y-2">
      {hasTicket ? (
        <Link
          href={`/tickets/${row.ticketNumber}`}
          className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary transition hover:bg-primary/15"
        >
          <Ticket className="size-3 shrink-0" />
          #{row.ticketNumber}
        </Link>
      ) : null}
      {hasText ? <CompactExpandableText text={plainText} maxLines={3} /> : null}
    </div>
  );
}
