"use client";

import { useMemo, useState } from "react";

import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  emailsMatch,
  findByEmail,
  pinCurrentUserFirst,
} from "@/lib/ticket-form";
import { ticketsService } from "@/lib/services/tickets.service";
import { useAuth } from "@/lib/use-auth";
import { cn } from "@/lib/utils";

export type TicketResponsibleOption = {
  id: number;
  name: string;
  email: string | null;
};

type TicketResponsibleSelectProps = {
  ticketNumber: number;
  responsibleId?: number | null;
  responsibleName?: string | null;
  options: TicketResponsibleOption[];
  disabled?: boolean;
  compact?: boolean;
  onUpdated?: (next: {
    responsibleId: number | null;
    responsibleName: string | null;
  }) => void;
};

function resolveValue(
  options: TicketResponsibleOption[],
  responsibleId?: number | null,
  responsibleName?: string | null,
): string {
  if (
    responsibleId != null &&
    options.some((row) => row.id === responsibleId)
  ) {
    return String(responsibleId);
  }
  const name = responsibleName?.trim().toLowerCase();
  if (!name) return "";
  const byName = options.find((row) => row.name.trim().toLowerCase() === name);
  return byName ? String(byName.id) : "";
}

export function TicketResponsibleSelect({
  ticketNumber,
  responsibleId,
  responsibleName,
  options,
  disabled = false,
  compact = false,
  onUpdated,
}: TicketResponsibleSelectProps) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  const selectOptions = useMemo(() => {
    const sorted = [...options].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR"),
    );
    return pinCurrentUserFirst(sorted, user?.email).map((row) => {
      const label = row.email ? `${row.name} (${row.email})` : row.name;
      return {
        value: String(row.id),
        label: emailsMatch(row.email, user?.email) ? `${label} — você` : label,
      };
    });
  }, [options, user?.email]);

  const value = resolveValue(options, responsibleId, responsibleName);

  async function handleChange(nextValue: string) {
    if (nextValue === value) return;
    const selected = nextValue
      ? (options.find((row) => String(row.id) === nextValue) ?? null)
      : null;
    const nextId = selected?.id ?? null;
    const nextName = selected?.name ?? null;
    try {
      setSaving(true);
      const res = await ticketsService.updateTicket(ticketNumber, {
        responsibleId: nextId,
        responsibleName: nextName,
      });
      onUpdated?.({ responsibleId: nextId, responsibleName: nextName });
      if (!compact) {
        notifySuccess(res.message);
      }
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível alterar o responsável.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={cn(compact && "min-w-[220px]")}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <SearchableSelectField
        value={value}
        onChange={handleChange}
        options={selectOptions}
        loading={saving}
        disabled={disabled || saving}
        preserveOrder
        alwaysShowSearch
        emptyLabel={compact ? undefined : "Sem responsável"}
        placeholder="Selecione o responsável"
        className={compact ? "h-9" : undefined}
      />
    </div>
  );
}

export function mapFilterResponsibles(
  rows: Array<{ externalId: number; name: string; email: string | null }>,
): TicketResponsibleOption[] {
  return rows.map((row) => ({
    id: row.externalId,
    name: row.name,
    email: row.email,
  }));
}

export function currentUserResponsibleId(
  options: TicketResponsibleOption[],
  email: string | null | undefined,
): number | null {
  return findByEmail(options, email)?.id ?? null;
}
