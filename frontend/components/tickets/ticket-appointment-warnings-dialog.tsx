"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, Download, Loader2 } from "lucide-react";

import { AppointmentDescriptionView } from "@/components/tickets/appointment-description-view";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldLabel } from "@/components/ui/field-label";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";
import { TICKET_APPOINTMENT_WARNING_DIALOG_INTRO } from "@/lib/module-copy";
import { notifyError } from "@/lib/notify";
import {
  ticketsService,
  type TicketAppointmentWarningDetail,
  type TicketAppointmentWarningListItem,
} from "@/lib/services/tickets.service";
import { cn } from "@/lib/utils";

type Props = {
  ticketNumber: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAcknowledged?: () => void;
};

function formatWarningDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TicketAppointmentWarningsDialog({
  ticketNumber,
  open,
  onOpenChange,
  onAcknowledged,
}: Props) {
  const [loadingList, setLoadingList] = useState(false);
  const [listLoaded, setListLoaded] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [ackBusy, setAckBusy] = useState(false);
  const [warnings, setWarnings] = useState<TicketAppointmentWarningListItem[]>([]);
  const [sessionDismissed, setSessionDismissed] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketAppointmentWarningDetail | null>(
    null,
  );
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const visibleWarnings = useMemo(
    () =>
      warnings.filter((item) => !sessionDismissed.has(item.portalAppointmentId)),
    [warnings, sessionDismissed],
  );

  const loadWarnings = useCallback(async () => {
    if (!Number.isFinite(ticketNumber)) return;
    try {
      setLoadingList(true);
      setListLoaded(false);
      const res = await ticketsService.pendingAppointmentWarnings(ticketNumber);
      setWarnings(res.warnings);
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar as atenções.",
      );
      setWarnings([]);
    } finally {
      setLoadingList(false);
      setListLoaded(true);
    }
  }, [ticketNumber]);

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setDetail(null);
      setDontShowAgain(false);
      setSessionDismissed(new Set());
      setListLoaded(false);
      return;
    }
    void loadWarnings();
  }, [open, loadWarnings]);

  useEffect(() => {
    if (!open || selectedId) return;
    if (visibleWarnings.length === 1) {
      setSelectedId(visibleWarnings[0]!.portalAppointmentId);
    }
  }, [open, selectedId, visibleWarnings]);

  useEffect(() => {
    if (!open || !selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoadingDetail(true);
        const res = await ticketsService.appointmentWarningDetail(
          ticketNumber,
          selectedId,
        );
        if (!cancelled) setDetail(res);
      } catch (err) {
        if (!cancelled) {
          notifyError(
            err instanceof Error
              ? err.message
              : "Não foi possível carregar a atenção.",
          );
          setSelectedId(null);
        }
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selectedId, ticketNumber]);

  async function openAttachment(
    attachment: TicketAppointmentWarningDetail["attachments"][number],
    inline: boolean,
  ) {
    const { blob, filename, mimeType } = await ticketsService.fetchAttachment({
      fileId: attachment.fileId,
      inline,
    });
    const url = URL.createObjectURL(new Blob([blob], { type: mimeType }));
    if (inline) {
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    if (!open || loadingList || !listLoaded) return;
    if (visibleWarnings.length === 0) {
      onOpenChange(false);
    }
  }, [open, loadingList, listLoaded, visibleWarnings.length, onOpenChange]);

  async function handleConfirmRead() {
    if (!selectedId) return;
    const currentId = selectedId;
    try {
      setAckBusy(true);
      if (dontShowAgain) {
        await ticketsService.acknowledgeAppointmentWarning(
          ticketNumber,
          currentId,
          true,
        );
        setWarnings((prev) =>
          prev.filter((item) => item.portalAppointmentId !== currentId),
        );
        onAcknowledged?.();
      } else {
        setSessionDismissed((prev) => new Set(prev).add(currentId));
      }
      setSelectedId(null);
      setDetail(null);
      setDontShowAgain(false);
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível confirmar a leitura.",
      );
    } finally {
      setAckBusy(false);
    }
  }

  const showList = !selectedId && visibleWarnings.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="font-sans max-h-[min(90vh,820px)] max-w-2xl overflow-hidden border-amber-500/30 bg-card p-0 text-card-foreground">
        <DialogHeader className="space-y-2 border-b border-amber-500/20 bg-amber-500/10 px-6 py-4">
          <div className="flex items-center gap-2 text-amber-200">
            <AlertTriangle className="size-5 shrink-0" />
            <DialogTitle className="text-lg text-foreground">
              {showList
                ? "Atenções pendentes"
                : detail
                  ? "Atenção"
                  : "Atenções"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {showList
              ? TICKET_APPOINTMENT_WARNING_DIALOG_INTRO
              : "Leia o conteúdo abaixo. Você pode marcar para não exibir novamente."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[min(58vh,560px)] overflow-y-auto px-6 py-4">
          {loadingList ? (
            <div className="flex min-h-[160px] items-center justify-center">
              <Loader2 className="size-7 animate-spin text-amber-400" />
            </div>
          ) : visibleWarnings.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma atenção pendente de leitura.
            </p>
          ) : showList ? (
            <ul className="space-y-2">
              {visibleWarnings.map((item) => (
                <li key={item.portalAppointmentId}>
                  <button
                    type="button"
                    className="w-full rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-left transition hover:border-amber-500/40 hover:bg-amber-500/5"
                    onClick={() => setSelectedId(item.portalAppointmentId)}
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {formatWarningDate(item.appointmentDate)}
                      </span>
                      <span>
                        {item.initTime}–{item.endTime}
                      </span>
                      <span>· {item.userName}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-foreground/90">
                      {item.descriptionPreview || "—"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          ) : loadingDetail || !detail ? (
            <div className="flex min-h-[160px] items-center justify-center">
              <Loader2 className="size-7 animate-spin text-amber-400" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
                {formatWarningDate(detail.appointmentDate)} · {detail.initTime}–
                {detail.endTime}
              </div>

              <div className="space-y-2">
                <FieldLabel className="font-sans text-sm font-semibold text-foreground">
                  Título
                </FieldLabel>
                <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-foreground">
                  {detail.ticketTitle}
                </div>
              </div>

              <div className="space-y-2">
                <FieldLabel className="font-sans text-sm font-semibold text-foreground">
                  Quem apontou
                </FieldLabel>
                <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-foreground">
                  {detail.userName}
                </div>
              </div>

              <div className="space-y-2">
                <FieldLabel className="font-sans text-sm font-semibold text-foreground">
                  Descrição
                </FieldLabel>
                <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                  <AppointmentDescriptionView
                    description={detail.description}
                    attachments={detail.attachments}
                  />
                </div>
              </div>

              {detail.attachments.some((a) => !a.mimeType.startsWith("image/")) ? (
                <ul className="space-y-2">
                  {detail.attachments
                    .filter((a) => !a.mimeType.startsWith("image/"))
                    .map((attachment) => (
                      <li
                        key={attachment.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 truncate">
                          {attachment.originalName}{" "}
                          <span className="text-xs text-muted-foreground">
                            ({formatFileSize(attachment.size)})
                          </span>
                        </span>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void openAttachment(attachment, true)}
                          >
                            Abrir
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void openAttachment(attachment, false)}
                          >
                            <Download className="mr-1 size-3.5" />
                            Baixar
                          </Button>
                        </div>
                      </li>
                    ))}
                </ul>
              ) : null}
            </div>
          )}
        </div>

        {!showList && selectedId && detail ? (
          <>
            <label className="mx-6 flex items-start gap-2 text-sm text-foreground">
              <FlipCheckbox
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                disabled={ackBusy}
              />
              <span>Não exibir novamente</span>
            </label>
            <DialogFooter className="gap-2 border-t border-border/60 px-6 py-4">
              {visibleWarnings.length > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={ackBusy}
                  onClick={() => {
                    setSelectedId(null);
                    setDetail(null);
                    setDontShowAgain(false);
                  }}
                >
                  <ChevronLeft className="mr-1 size-4" />
                  Voltar à lista
                </Button>
              ) : null}
              <Button
                type="button"
                className={cn(!dontShowAgain && "bg-amber-600 hover:bg-amber-600/90")}
                disabled={ackBusy}
                onClick={() => void handleConfirmRead()}
              >
                {ackBusy ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Salvando…
                  </>
                ) : (
                  "OK, li a atenção"
                )}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
