"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TICKET_REMOVE_RESPONSIBLE_PRETICKET_WARNING } from "@/lib/module-copy";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  hasAppointments?: boolean;
};

export function TicketRemoveResponsiblePreTicketDialog({
  open,
  onOpenChange,
  onConfirm,
  hasAppointments = false,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="font-sans max-w-lg border-border bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle>Remover responsável</DialogTitle>
          <DialogDescription className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <span className="block">{TICKET_REMOVE_RESPONSIBLE_PRETICKET_WARNING}</span>
            {hasAppointments ? (
              <span className="block">
                Os apontamentos, anexos e histórico deste ticket serão mantidos.
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            Remover responsável
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
