"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  Download,
  Link2,
  Loader2,
  Paperclip,
  Ticket,
} from "lucide-react";

import AppShell from "@/components/layout/app-shell";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppointmentDescriptionView } from "@/components/tickets/appointment-description-view";
import { TicketAppointmentModal } from "@/components/tickets/ticket-appointment-modal";
import { PortalAppointmentTifluxWarningDialog } from "@/components/tickets/portal-appointment-tiflux-warning-dialog";
import {
  canChangeTicketStage,
  canCreateTicket,
  canCreateTicketAppointment,
  TICKETS_APPOINTMENT_CREATE_RESTRICTED,
  TICKETS_CREATE_ADMIN_ONLY_MESSAGE,
} from "@/lib/access-control";
import {
  SYNC_STATUS_PAUSED,
  SYNC_STATUS_PENDING,
  SYNC_STATUS_PORTAL_ONLY,
} from "@/lib/module-copy";
import { useConfirm } from "@/lib/confirm";
import { notifyError, notifySuccess } from "@/lib/notify";
import { shouldShowTifluxPortalOnlyWarning } from "@/lib/ticket-appointment-warning";
import {
  ticketsService,
  type PortalAppointmentEditContext,
  type TicketAppointment,
  type TicketDetailResponse,
  type TicketStagesResponse,
} from "@/lib/services/tickets.service";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";

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

function syncStatusLabel(row: TicketAppointment) {
  if (row.syncPaused && row.syncStatus === "PENDING_TIFLUX") {
    return SYNC_STATUS_PAUSED;
  }
  if (row.syncStatus === "PORTAL_ONLY") return SYNC_STATUS_PORTAL_ONLY;
  if (row.syncStatus === "PENDING_TIFLUX") return SYNC_STATUS_PENDING;
  return null;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isServerConfigMissingError(err: unknown) {
  return (
    err instanceof Error &&
    err.message.includes("Serviço não encontrado")
  );
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
  const [editingAppointment, setEditingAppointment] =
    useState<PortalAppointmentEditContext | null>(null);
  const [tifluxWarningOpen, setTifluxWarningOpen] = useState(false);
  const [pendingPortalAction, setPendingPortalAction] = useState<
    (() => void) | null
  >(null);
  const [pendingResumeId, setPendingResumeId] = useState<string | null>(null);
  const tifluxWarningConfirmedRef = useRef(false);
  const confirm = useConfirm();
  const [externalGmudRefInput, setExternalGmudRefInput] = useState("");
  const [gmudLinking, setGmudLinking] = useState(false);
  const [stagesData, setStagesData] = useState<TicketStagesResponse | null>(null);
  const [stageIdInput, setStageIdInput] = useState("");
  const [stageSaving, setStageSaving] = useState(false);
  const [stagesLoading, setStagesLoading] = useState(false);

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

  const loadStages = useCallback(async () => {
    if (!Number.isFinite(ticketNumber) || !canChangeTicketStage()) return;
    try {
      setStagesLoading(true);
      const res = await ticketsService.listStages(ticketNumber);
      setStagesData(res);
      setStageIdInput(
        res.currentStageId != null ? String(res.currentStageId) : "",
      );
    } catch (err) {
      if (isServerConfigMissingError(err)) {
        setStagesData(null);
        setStageIdInput("");
        return;
      }
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar os estágios do ticket.",
      );
    } finally {
      setStagesLoading(false);
    }
  }, [ticketNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadStages();
  }, [loadStages]);

  useEffect(() => {
    setExternalGmudRefInput(data?.externalGmudRef ?? "");
  }, [data?.externalGmudRef]);

  const ticket = data?.ticket;
  const externalGmudRef = data?.externalGmudRef;
  const stageOptions = (stagesData?.stages ?? []).map((stage) => ({
    value: String(stage.id),
    label: stage.firstStage ? `${stage.name} (inicial)` : stage.name,
  }));
  const stageChanged =
    stageIdInput !== "" &&
    stagesData?.currentStageId != null &&
    Number(stageIdInput) !== stagesData.currentStageId;

  async function handleSaveStage() {
    if (!Number.isFinite(ticketNumber) || !stageIdInput) return;
    const stageId = Number(stageIdInput);
    if (!Number.isFinite(stageId) || stageId <= 0) {
      notifyError("Selecione um estágio válido.");
      return;
    }
    try {
      setStageSaving(true);
      const res = await ticketsService.updateStage(ticketNumber, stageId);
      setData((prev) =>
        prev?.ticket
          ? {
              ...prev,
              ticket: {
                ...prev.ticket,
                stageName: res.stageName,
                stageGroup: res.stageGroup,
              },
            }
          : prev,
      );
      setStagesData((prev) =>
        prev
          ? {
              ...prev,
              currentStageId: res.stageId,
              currentStageName: res.stageName,
            }
          : prev,
      );
      notifySuccess(res.message);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível atualizar o estágio.",
      );
    } finally {
      setStageSaving(false);
    }
  }

  async function resumePausedSync(portalAppointmentId: string | null) {
    if (!portalAppointmentId || !Number.isFinite(ticketNumber)) return;
    try {
      await ticketsService.resumeAppointmentSync(ticketNumber, portalAppointmentId);
      await load();
    } catch {
      /* ignore */
    }
  }

  function handleAppointmentModalOpenChange(open: boolean) {
    if (!open) {
      const pausedId = editingAppointment?.portalAppointmentId ?? pendingResumeId;
      setAppointmentOpen(false);
      setEditingAppointment(null);
      if (pausedId) {
        void resumePausedSync(pausedId);
      }
      setPendingResumeId(null);
      return;
    }
    setAppointmentOpen(true);
  }

  async function preparePortalAppointmentAction(
    portalAppointmentId: string,
    onProceed: (ctx: PortalAppointmentEditContext) => void,
  ) {
    if (!Number.isFinite(ticketNumber)) return;
    try {
      const ctx = await ticketsService.appointmentEditContext(
        ticketNumber,
        portalAppointmentId,
      );
      if (ctx.canPauseSync) {
        await ticketsService.pauseAppointmentSync(ticketNumber, portalAppointmentId);
        setPendingResumeId(portalAppointmentId);
        await load();
      }

      const proceed = () => onProceed(ctx);
      if (ctx.existsInTiflux && shouldShowTifluxPortalOnlyWarning()) {
        setPendingPortalAction(() => proceed);
        setTifluxWarningOpen(true);
        return;
      }
      proceed();
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível preparar a ação.",
      );
    }
  }

  async function handleEditAppointment(portalAppointmentId: string) {
    await preparePortalAppointmentAction(portalAppointmentId, (ctx) => {
      setEditingAppointment(ctx);
      setAppointmentOpen(true);
    });
  }

  async function handleDeleteAppointment(portalAppointmentId: string) {
    await preparePortalAppointmentAction(portalAppointmentId, async () => {
      const ok = await confirm({
        title: "Excluir apontamento",
        description:
          "O apontamento será removido do portal. Se já existir no TiFlux, o registro lá permanece inalterado.",
        confirmText: "Excluir",
        variant: "error",
      });
      if (!ok) {
        await resumePausedSync(portalAppointmentId);
        setPendingResumeId(null);
        return;
      }
      try {
        const res = await ticketsService.deleteAppointment(
          ticketNumber,
          portalAppointmentId,
        );
        setPendingResumeId(null);
        notifySuccess(res.message);
        await load();
      } catch (err) {
        notifyError(
          err instanceof Error ? err.message : "Não foi possível excluir.",
        );
        await resumePausedSync(portalAppointmentId);
        setPendingResumeId(null);
      }
    });
  }

  async function handleSaveGmudLink() {
    if (!Number.isFinite(ticketNumber)) return;
    const trimmed = externalGmudRefInput.trim();
    try {
      setGmudLinking(true);
      const res = await ticketsService.linkGmud(ticketNumber, trimmed || null);
      setData((prev) =>
        prev ? { ...prev, externalGmudRef: res.externalGmudRef } : prev,
      );
      notifySuccess(
        res.externalGmudRef
          ? `Referência GMUD "${res.externalGmudRef}" salva no ticket.`
          : "Referência GMUD removida.",
      );
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Não foi possível atualizar a GMUD.");
    } finally {
      setGmudLinking(false);
    }
  }

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
              {ticket && canCreateTicketAppointment() ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setEditingAppointment(null);
                    setPendingResumeId(null);
                    setAppointmentOpen(true);
                  }}
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
                {data?.syncPending ? (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/90">
                    Ticket recém-criado: ainda não aparece na listagem local, mas
                    já está disponível no TiFlux.
                  </p>
                ) : null}
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
                  {data?.portalDescription ? (
                    <Card className="lg:col-span-2">
                      <CardHeader>
                        <CardTitle className="text-base">Descrição do chamado</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <AppointmentDescriptionView
                          description={data.portalDescription.description}
                          attachments={data.portalDescription.attachments ?? []}
                        />
                      </CardContent>
                    </Card>
                  ) : null}

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
                    <CardContent className="space-y-3 text-sm">
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
                      {canChangeTicketStage() && (stagesLoading || stagesData) ? (
                        <div className="space-y-2 border-t border-border pt-3">
                          <Label className="text-xs font-semibold text-muted-foreground">
                            Estágio no TiFlux
                          </Label>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                            <div className="flex-1">
                              <SearchableSelectField
                                value={stageIdInput}
                                onChange={setStageIdInput}
                                options={stageOptions}
                                loading={stagesLoading}
                                disabled={
                                  stageSaving ||
                                  stagesLoading ||
                                  stagesData?.isClosed === true
                                }
                                placeholder="Selecione o estágio"
                                preserveOrder
                              />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-11 shrink-0"
                              disabled={
                                stageSaving ||
                                stagesLoading ||
                                !stageChanged ||
                                stagesData?.isClosed === true
                              }
                              onClick={() => void handleSaveStage()}
                            >
                              {stageSaving ? (
                                <Loader2 className="mr-2 size-4 animate-spin" />
                              ) : null}
                              Salvar estágio
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {stagesData?.isClosed
                              ? "Ticket fechado — o estágio não pode ser alterado."
                              : "Avance o estágio para permitir apontamentos no TiFlux (a etapa inicial geralmente não aceita horas)."}
                          </p>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Link2 className="size-4 text-primary" />
                      GMUD do cliente
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {canCreateTicket() ? (
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          Referência GMUD do cliente
                        </Label>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <Input
                            value={externalGmudRefInput}
                            onChange={(e) => setExternalGmudRefInput(e.target.value)}
                            placeholder="Ex.: GMUD-2024-001 (vazio remove)"
                            className="h-11 flex-1"
                            disabled={gmudLinking}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 shrink-0 sm:min-w-[7rem]"
                            disabled={gmudLinking}
                            onClick={() => void handleSaveGmudLink()}
                          >
                            {gmudLinking ? (
                              <Loader2 className="mr-2 size-4 animate-spin" />
                            ) : null}
                            Salvar
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Código informado pelo cliente — não vincula à GMUD cadastrada no Alle.
                        </p>
                      </div>
                    ) : externalGmudRef ? (
                      <p className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm font-medium text-foreground">
                        {externalGmudRef}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nenhuma referência GMUD informada para este ticket.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-base">Apontamentos</CardTitle>
                    {!canCreateTicketAppointment() ? (
                      <p className="text-xs font-normal text-muted-foreground">
                        {TICKETS_APPOINTMENT_CREATE_RESTRICTED}
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
                          {canCreateTicketAppointment() ? (
                            <th className="px-4 py-2">Ações</th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody>
                        {(data?.appointments ?? []).length === 0 ? (
                          <tr>
                            <td
                              colSpan={canCreateTicketAppointment() ? 8 : 7}
                              className="px-4 py-8 text-center text-muted-foreground"
                            >
                              Nenhum apontamento neste ticket.
                            </td>
                          </tr>
                        ) : (
                          data?.appointments.map((row) => {
                            const status = syncStatusLabel(row);
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
                              <td className="max-w-[360px] px-4 py-2 text-muted-foreground">
                                <AppointmentDescriptionView
                                  description={row.description}
                                  attachments={row.attachments ?? []}
                                />
                                {(row.attachments ?? []).some(
                                  (a) => !a.mimeType.startsWith("image/"),
                                ) ? (
                                  <ul className="mt-2 space-y-1">
                                    {row.attachments.map((attachment) => {
                                      if (attachment.mimeType.startsWith("image/")) return null;
                                      return (
                                        <li
                                          key={attachment.id}
                                          className="flex flex-wrap items-center gap-1 rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-xs text-foreground"
                                        >
                                          <Paperclip className="size-3 shrink-0" />
                                          <span className="min-w-0 truncate">
                                            {attachment.originalName} ({formatFileSize(attachment.size)})
                                          </span>
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
                              {canCreateTicketAppointment() ? (
                                <td className="px-4 py-2">
                                  {row.portalAppointmentId ? (
                                    <div className="flex flex-wrap gap-1">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={() =>
                                          void handleEditAppointment(
                                            row.portalAppointmentId!,
                                          )
                                        }
                                      >
                                        Editar
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-xs text-rose-600 hover:text-rose-600"
                                        onClick={() =>
                                          void handleDeleteAppointment(
                                            row.portalAppointmentId!,
                                          )
                                        }
                                      >
                                        Excluir
                                      </Button>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </td>
                              ) : null}
                            </tr>
                          );
                          })
                        )}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                {canCreateTicketAppointment() ? (
                  <>
                    <TicketAppointmentModal
                      ticketNumber={ticket.ticketNumber}
                      open={appointmentOpen}
                      onOpenChange={handleAppointmentModalOpenChange}
                      editingAppointment={editingAppointment}
                      onCreated={() => {
                        setEditingAppointment(null);
                        setPendingResumeId(null);
                        void load();
                      }}
                    />
                    <PortalAppointmentTifluxWarningDialog
                      open={tifluxWarningOpen}
                      onOpenChange={(open) => {
                        setTifluxWarningOpen(open);
                        if (!open) {
                          if (
                            !tifluxWarningConfirmedRef.current &&
                            pendingResumeId
                          ) {
                            void resumePausedSync(pendingResumeId);
                            setPendingResumeId(null);
                          }
                          tifluxWarningConfirmedRef.current = false;
                          setPendingPortalAction(null);
                        }
                      }}
                      onConfirm={() => {
                        tifluxWarningConfirmedRef.current = true;
                        pendingPortalAction?.();
                        setPendingPortalAction(null);
                      }}
                    />
                  </>
                ) : null}
              </>
            )}
          </div>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
