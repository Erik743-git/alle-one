"use client";

import { useState } from "react";
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
import { TICKET_NO_RESPONSIBLE_PRETICKET_WARNING } from "@/lib/module-copy";
import { setSkipNoResponsiblePreTicketWarning } from "@/lib/ticket-no-responsible-warning";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  actionLabel?: string;
};

export function TicketNoResponsiblePreTicketDialog({
  open,
  onOpenChange,
  onConfirm,
  actionLabel = "Criar pré-ticket",
}: Props) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  function handleConfirm() {
    if (dontShowAgain) {
      setSkipNoResponsiblePreTicketWarning(true);
    }
    onConfirm();
    onOpenChange(false);
    setDontShowAgain(false);
  }

  function handleCancel() {
    onOpenChange(false);
    setDontShowAgain(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="font-sans max-w-lg border-border bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle>Ticket sem responsável</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {TICKET_NO_RESPONSIBLE_PRETICKET_WARNING}
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-start gap-2 text-sm text-foreground">
          <FlipCheckbox
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
          />
          <span>Não exibir este aviso novamente</span>
        </label>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm}>
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
