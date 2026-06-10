"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Clock, Download, ExternalLink, Loader2, Paperclip, Ticket } from "lucide-react";

import AppShell from "@/components/layout/app-shell";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TicketAppointmentModal } from "@/components/tickets/ticket-appointment-modal";
import {
  canCreateTicketsAndAppointments,
  TICKETS_CREATE_ADMIN_ONLY_MESSAGE,
} from "@/lib/access-control";
import {
  SYNC_STATUS_PENDING,
  SYNC_STATUS_PORTAL_ONLY,
} from "@/lib/module-copy";
import { notifyError } from "@/lib/notify";
import {
  ticketsService,
  type TicketAppointment,
  type TicketDetailResponse,
} from "@/lib/services/tickets.service";

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function appointmentRowKey(row: {
  externalId: number | null;
  portalAppointmentId: string | null;
  appointmentDate: string | null;
  initTime: string | null;
}) {
  return (
    row.portalAppointmentId ??
    (row.externalId != null ? `tiflux-${row.externalId}` : null) ??
    `${row.appointmentDate}-${row.initTime}`
  );
}

function syncStatusLabel(status: string) {
  if (status === "PORTAL_ONLY") return SYNC_STATUS_PORTAL_ONLY;
  if (status === "PENDING_TIFLUX") return SYNC_STATUS_PENDING;
  return null;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function openPortalAttachment(
  attachment: TicketAppointment["attachments"][number],
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

export default function TicketDetailPage() {
  const params = useParams<{ ticketNumber: string }>();
  const ticketNumber = Number(params.ticketNumber);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TicketDetailResponse | null>(null);
  const [appointmentOpen, setAppointmentOpen] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(ticketNumber)) return;
    try {
      setLoading(true);
      const res = await ticketsService.detail(ticketNumber);
      setData(res);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível carregar o ticket.",
      );
    } finally {
      setLoading(false);
    }
  }, [ticketNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  const ticket = data?.ticket;

  return (
    <ProtectedPage>
      <PermissionGate module="TICKETS">
        <AppShell>
          <div className="font-sans w-full space-y-6">
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm" className="w-fit">
                <Link href="/tickets">
                  <ArrowLeft className="mr-2 size-4" />
                  Voltar à lista
                </Link>
              </Button>
              {ticket && canCreateTicketsAndAppointments() ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setAppointmentOpen(true)}
                >
                  <Clock className="mr-2 size-4" />
                  Apontar
                </Button>
              ) : null}
            </div>

            {loading ? (
              <div className="flex min-h-[240px] items-center justify-center">
                <Loader2 className="size-8 animate-spin text-primary" />
              </div>
            ) : !ticket ? (
              <p className="text-muted-foreground">Ticket não encontrado.</p>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Ticket size={24} />
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold text-foreground">
                        #{ticket.ticketNumber} — {ticket.title ?? "Sem título"}
                      </h1>
                      <p className="text-sm text-muted-foreground">
                        {ticket.statusName ?? "—"} · {ticket.stageName ?? "—"} ·{" "}
                        {ticket.responsibleName ?? "Sem responsável"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <p className="text-xs text-muted-foreground">Atendentes</p>
                      <p className="text-2xl font-bold">{data?.summary.attendantsCount ?? 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <p className="text-xs text-muted-foreground">Horas</p>
                      <p className="text-2xl font-bold">
                        {data?.summary.totalHoursFormatted ?? "00:00"}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <p className="text-xs text-muted-foreground">Apontamentos</p>
                      <p className="text-2xl font-bold">
                        {data?.summary.appointmentsCount ?? 0}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <p className="text-xs text-muted-foreground">Mesa</p>
                      <p className="text-lg font-semibold">{ticket.deskName ?? "—"}</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Solicitante</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                      <p className="font-semibold">{ticket.requestorName ?? "—"}</p>
                      <p className="text-muted-foreground">{ticket.requestorEmail ?? "—"}</p>
                      <p className="text-muted-foreground">
                        {ticket.requestorTelephone ?? "—"}
                      </p>
                      <p className="pt-2">
                        <span className="text-muted-foreground">Cliente: </span>
                        {ticket.clientName ?? "—"}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Informações</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                      <p>
                        <span className="text-muted-foreground">Origem: </span>
                        {ticket.origin ?? "—"}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Prioridade: </span>
                        {ticket.priorityName ?? "—"}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Responsável: </span>
                        {ticket.responsibleName ?? "—"}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-base">Apontamentos</CardTitle>
                    {!canCreateTicketsAndAppointments() ? (
                      <p className="text-xs font-normal text-muted-foreground">
                        {TICKETS_CREATE_ADMIN_ONLY_MESSAGE}
                      </p>
                    ) : null}
                  </CardHeader>
                  <CardContent className="overflow-x-auto p-0">
                    <table className="w-full min-w-[860px] text-left text-sm">
                      <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2">Atendente</th>
                          <th className="px-4 py-2">Data</th>
                          <th className="px-4 py-2">Horário</th>
                          <th className="px-4 py-2">Duração</th>
                          <th className="px-4 py-2">Tipo</th>
                          <th className="px-4 py-2">Atendimento</th>
                          <th className="px-4 py-2">Descrição</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data?.appointments ?? []).length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                              Nenhum apontamento neste ticket.
                            </td>
                          </tr>
                        ) : (
                          data?.appointments.map((row) => {
                            const status = syncStatusLabel(row.syncStatus);
                            return (
                            <tr
                              key={appointmentRowKey(row)}
                              className="border-b border-border/60 align-top"
                            >
                              <td className="px-4 py-2">
                                <div>{row.userName ?? "—"}</div>
                                {status ? (
                                  <span className="alle-badge-overtime mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium">
                                    {status}
                                  </span>
                                ) : null}
                                {row.attachmentCount > 0 ? (
                                  <span className="mt-1 ml-1 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                    {row.attachmentCount} anexo(s)
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-4 py-2">{row.appointmentDate ?? "—"}</td>
                              <td className="whitespace-nowrap px-4 py-2">
                                {row.initTime ?? "—"} – {row.endTime ?? "—"}
                              </td>
                              <td className="px-4 py-2">{formatMinutes(row.minutes)}</td>
                              <td className="px-4 py-2">{row.valorizationLabel ?? "—"}</td>
                              <td className="px-4 py-2">{row.attendanceLabel ?? "—"}</td>
                              <td className="max-w-[280px] px-4 py-2 text-muted-foreground">
                                <p>{row.description?.trim() || "—"}</p>
                                {row.attachments?.length > 0 ? (
                                  <ul className="mt-2 space-y-1">
                                    {row.attachments.map((attachment) => {
                                      const isImage =
                                        attachment.mimeType.startsWith("image/");
                                      return (
                                        <li
                                          key={attachment.id}
                                          className="flex flex-wrap items-center gap-1 rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-xs text-foreground"
                                        >
                                          <Paperclip className="size-3 shrink-0" />
                                          <span className="min-w-0 truncate">
                                            {attachment.originalName} ({formatFileSize(attachment.size)})
                                          </span>
                                          {isImage ? (
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              className="h-6 px-2 text-xs"
                                              onClick={() =>
                                                void openPortalAttachment(attachment, true).catch(
                                                  (err) =>
                                                    notifyError(
                                                      err instanceof Error
                                                        ? err.message
                                                        : "Não foi possível abrir o anexo.",
                                                    ),
                                                )
                                              }
                                            >
                                              Ver
                                            </Button>
                                          ) : null}
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-2 text-xs"
                                            onClick={() =>
                                              void openPortalAttachment(attachment, false).catch(
                                                (err) =>
                                                  notifyError(
                                                    err instanceof Error
                                                      ? err.message
                                                      : "Não foi possível baixar o anexo.",
                                                  ),
                                              )
                                            }
                                          >
                                            Baixar
                                          </Button>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                ) : null}
                              </td>
                            </tr>
                          );
                          })
                        )}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                {canCreateTicketsAndAppointments() ? (
                  <TicketAppointmentModal
                    ticketNumber={ticket.ticketNumber}
                    open={appointmentOpen}
                    onOpenChange={setAppointmentOpen}
                    onCreated={() => void load()}
                  />
                ) : null}
              </>
            )}
          </div>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
