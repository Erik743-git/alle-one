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
import { TICKET_APPOINTMENT_TIFLUX_PORTAL_ONLY_WARNING } from "@/lib/module-copy";
import { setSkipTifluxPortalOnlyWarning } from "@/lib/ticket-appointment-warning";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  actionLabel?: string;
};

export function PortalAppointmentTifluxWarningDialog({
  open,
  onOpenChange,
  onConfirm,
  actionLabel = "Continuar no portal",
}: Props) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  function handleConfirm() {
    if (dontShowAgain) {
      setSkipTifluxPortalOnlyWarning(true);
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
          <DialogTitle>Alteração somente no portal</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {TICKET_APPOINTMENT_TIFLUX_PORTAL_ONLY_WARNING}
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
