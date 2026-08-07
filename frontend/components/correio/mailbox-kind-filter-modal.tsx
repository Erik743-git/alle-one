"use client";

import { useState } from "react";
import { Filter } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";
import {
  ALL_MAILBOX_KINDS,
  MAILBOX_KIND_OPTIONS,
  type MailboxNotificationKind,
} from "@/lib/services/mailbox.service";
import { cn } from "@/lib/utils";

type MailboxKindFilterModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: MailboxNotificationKind[];
  onApply: (kinds: MailboxNotificationKind[]) => void;
  countsByKind?: Partial<Record<MailboxNotificationKind, number>>;
};

export function MailboxKindFilterModal({
  open,
  onOpenChange,
  selected,
  onApply,
  countsByKind = {},
}: MailboxKindFilterModalProps) {
  const [draft, setDraft] = useState<MailboxNotificationKind[]>(selected);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(selected);
  }

  const allSelected = draft.length === ALL_MAILBOX_KINDS.length;

  function toggle(kind: MailboxNotificationKind) {
    setDraft((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind],
    );
  }

  function selectAll() {
    setDraft([...ALL_MAILBOX_KINDS]);
  }

  function clearAll() {
    setDraft([]);
  }

  function handleApply() {
    if (draft.length === 0) return;
    onApply(draft);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="font-sans gap-5 p-6 sm:max-w-xl border-border bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="size-5" />
            Filtrar notificações
          </DialogTitle>
          <DialogDescription>
            Escolha quais tipos de aviso deseja ver na caixa de entrada. A
            seleção fica salva neste navegador.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={selectAll}>
            Marcar todas
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={clearAll}>
            Desmarcar todas
          </Button>
        </div>

        <ul className="max-h-[min(58vh,440px)] space-y-2.5 overflow-y-auto pr-1">
          {MAILBOX_KIND_OPTIONS.map((opt) => {
            const checked = draft.includes(opt.kind);
            const count = countsByKind[opt.kind] ?? 0;
            return (
              <li key={opt.kind}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition",
                    checked
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-muted/20 hover:bg-muted/40",
                  )}
                >
                  <FlipCheckbox
                    checked={checked}
                    onChange={() => toggle(opt.kind)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {opt.label}
                      </span>
                      {count > 0 ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                          {count}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                      {opt.description}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <DialogFooter className="-mx-6 -mb-6 gap-3 p-5 sm:gap-4">
          <Button
            type="button"
            variant="outline"
            className="min-w-[7.5rem]"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="min-w-[7.5rem]"
            disabled={draft.length === 0}
            onClick={handleApply}
          >
            Aplicar ({draft.length})
          </Button>
        </DialogFooter>

        {!allSelected && draft.length > 0 ? (
          <p className="text-center text-[11px] text-muted-foreground">
            {ALL_MAILBOX_KINDS.length - draft.length} tipo(s) oculto(s) na lista.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
