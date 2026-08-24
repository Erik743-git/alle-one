"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TICKET_APPOINTMENT_NOT_STARTED_WARNING } from "@/lib/module-copy";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy?: boolean;
  canChangeStage?: boolean;
  onConfirmStageChange: () => void;
};

export function TicketAppointmentNotStartedDialog({
  open,
  onOpenChange,
  busy = false,
  canChangeStage = true,
  onConfirmStageChange,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="font-sans max-w-lg border-border bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle>Ticket não iniciado</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {TICKET_APPOINTMENT_NOT_STARTED_WARNING}
            {!canChangeStage
              ? " Você não tem permissão para alterar o estágio deste ticket."
              : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancelar
          </Button>
          {canChangeStage ? (
            <Button type="button" onClick={onConfirmStageChange} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Alterando estágio…
                </>
              ) : (
                "Mudar para Em execução e apontar"
              )}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
