"use client";

import Link from "next/link";
import { ExternalLink, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";

export type AdminAnswerQuestionTarget = {
  id: string;
  ticketNumber: number;
  message: string;
  userName?: string | null;
  appointmentDate?: string;
  initTime?: string | null;
  endTime?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: AdminAnswerQuestionTarget | null;
  responseNote: string;
  onResponseNoteChange: (value: string) => void;
  abonar: boolean;
  onAbonarChange: (value: boolean) => void;
  saving?: boolean;
  onSubmit: () => void;
};

export function AdminAnswerQuestionDialog({
  open,
  onOpenChange,
  target,
  responseNote,
  onResponseNoteChange,
  abonar,
  onAbonarChange,
  saving = false,
  onSubmit,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Responder questionamento</DialogTitle>
          <DialogDescription>
            Envie a resposta ao cliente. Marque abonar se o apontamento for
            aceito sem alteração.
          </DialogDescription>
        </DialogHeader>

        {target ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <p className="font-medium alle-stat-overtime">
                Justificativa do cliente
              </p>
              <p className="mt-1 text-muted-foreground">{target.message}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Ticket #{target.ticketNumber}
                {target.userName ? ` · ${target.userName}` : ""}
                {target.appointmentDate
                  ? ` · ${target.appointmentDate}`
                  : ""}
                {target.initTime && target.endTime
                  ? ` · ${target.initTime}–${target.endTime}`
                  : ""}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-response-note">
                Resposta ao cliente <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="admin-response-note"
                value={responseNote}
                onChange={(e) => onResponseNoteChange(e.target.value)}
                placeholder="Explique a resposta ao questionamento do cliente…"
                rows={4}
              />
            </div>

            <label className="flex items-start gap-2 text-sm text-foreground">
              <FlipCheckbox
                checked={abonar}
                onChange={(e) => onAbonarChange(e.target.checked)}
              />
              <span>
                Abonar apontamento
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Marque se o apontamento for aceito sem necessidade de alteração.
                </span>
              </span>
            </label>

            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
              <Link href={`/tickets/${target.ticketNumber}`} target="_blank">
                <ExternalLink className="mr-2 size-4" />
                Editar ticket
              </Link>
            </Button>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={saving || !target}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Enviar resposta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
