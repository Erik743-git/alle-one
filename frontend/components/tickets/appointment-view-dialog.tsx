"use client";

import { Download } from "lucide-react";

import { AppointmentDescriptionView } from "@/components/tickets/appointment-description-view";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldLabel } from "@/components/ui/field-label";
import type { TicketAppointment } from "@/lib/services/tickets.service";

type Props = {
  ticketNumber: number;
  appointment: TicketAppointment | null;
  onOpenChange: (open: boolean) => void;
  /** Baixar/abrir anexo — a tela do ticket já sabe fazer isso. */
  onOpenAttachment?: (
    attachment: TicketAppointment["attachments"][number],
    inline: boolean,
  ) => void;
};

function formatDate(ymd: string | null): string {
  if (!ymd) return "—";
  const [y, m, d] = ymd.slice(0, 10).split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Leitura do apontamento de qualquer pessoa, na tela do chamado.
 *
 * Antes só quem podia editar conseguia abrir a linha; para os demais a
 * descrição ficava espremida na célula da tabela. Aqui ela ganha espaço,
 * sem nenhum campo editável — quem pode editar continua indo para o modal
 * de edição, que é outro caminho.
 *
 * Mesmo formato do modal de atenção: coluna flex, só o miolo rola, rodapé
 * fixo. Largo e não muito alto, que é como texto longo se lê bem.
 */
export function AppointmentViewDialog({
  ticketNumber,
  appointment,
  onOpenChange,
  onOpenAttachment,
}: Props) {
  const naoImagens =
    appointment?.attachments.filter((a) => !a.mimeType.startsWith("image/")) ??
    [];

  return (
    <Dialog open={Boolean(appointment)} onOpenChange={onOpenChange}>
      <DialogContent className="font-sans flex max-h-[min(84vh,680px)] max-w-4xl flex-col overflow-hidden bg-card p-0 text-card-foreground">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-6 py-4">
          <DialogTitle className="text-lg text-foreground">
            Apontamento do chamado #{ticketNumber}
          </DialogTitle>
        </DialogHeader>

        {appointment ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel className="font-sans text-sm font-semibold text-foreground">
                  Quem apontou
                </FieldLabel>
                <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-foreground">
                  {appointment.userName ?? "—"}
                </div>
              </div>

              <div className="space-y-2">
                <FieldLabel className="font-sans text-sm font-semibold text-foreground">
                  Quando
                </FieldLabel>
                <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-foreground">
                  {formatDate(appointment.appointmentDate)}
                  {appointment.initTime && appointment.endTime
                    ? ` · ${appointment.initTime}–${appointment.endTime}`
                    : ""}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <FieldLabel className="font-sans text-sm font-semibold text-foreground">
                Descrição
              </FieldLabel>
              <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                <AppointmentDescriptionView
                  description={appointment.description}
                  attachments={appointment.attachments}
                />
              </div>
            </div>

            {naoImagens.length > 0 ? (
              <ul className="space-y-2">
                {naoImagens.map((attachment) => (
                  <li
                    key={attachment.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {attachment.originalName}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({formatSize(attachment.size)})
                      </span>
                    </span>
                    {onOpenAttachment ? (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onOpenAttachment(attachment, true)}
                        >
                          Abrir
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onOpenAttachment(attachment, false)}
                        >
                          <Download className="mr-1 size-3.5" />
                          Baixar
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <DialogFooter
          bleed={false}
          className="shrink-0 border-t border-border/60 px-6"
        >
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
