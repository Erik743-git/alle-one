"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  Download,
  History,
  Link2,
  Loader2,
  MoreVertical,
  Pencil,
  Paperclip,
  Ticket,
  Trash2,
} from "lucide-react";

import AppShell from "@/components/layout/app-shell";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppointmentDescriptionView } from "@/components/tickets/appointment-description-view";
import { AppointmentDescriptionCell } from "@/components/tickets/appointment-description-cell";
import { TicketAppointmentModal } from "@/components/tickets/ticket-appointment-modal";
import { TicketHistoryPanel } from "@/components/tickets/ticket-history-panel";
import { PortalAppointmentTifluxWarningDialog } from "@/components/tickets/portal-appointment-tiflux-warning-dialog";
import {
  TicketResponsibleSelect,
  mapFilterResponsibles,
} from "@/components/tickets/ticket-responsible-select";
import {
  TicketOptionsMenu,
  type TicketOptionsChange,
} from "@/components/tickets/ticket-options-menu";
import {
  canChangeTicketStage,
  canCreateTicket,
  canCreateTicketAppointment,
  TICKETS_APPOINTMENT_CREATE_RESTRICTED,
} from "@/lib/access-control";
import {
  TICKET_APPOINTMENT_EXTERNAL_ONLY_ACTION,
  TICKET_APPOINTMENT_EXTERNAL_ONLY_BADGE,
  TICKET_APPOINTMENT_TIFLUX_ONLY_HINT,
  TICKET_DELETE_APPOINTMENT_CONFIRM,
  TICKET_SYNC_PENDING_BANNER,
} from "@/lib/module-copy";
import { useConfirm } from "@/lib/confirm";
import { notifyError, notifySuccess } from "@/lib/notify";
import { PORTAL_STAGE } from "@/lib/portal-ticket-stages";
import { shouldShowTifluxPortalOnlyWarning } from "@/lib/ticket-appointment-warning";
import {
  ticketsService,
  type PortalAppointmentEditContext,
  type TicketAppointment,
  type TicketDetailResponse,
  type TicketFilterCatalogs,
  type TicketStagesResponse,
} from "@/lib/services/tickets.service";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** ISO `YYYY-MM-DD` → `DD/MM/YYYY`. */
function formatAppointmentDate(value: string | null | undefined) {
  if (!value?.trim()) return "—";
  const [y, m, d] = value.trim().slice(0, 10).split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isOvernightTimes(initTime: string | null, endTime: string | null) {
  if (!initTime || !endTime) return false;
  const parse = (value: string) => {
    const [h, m] = value.split(":").map((part) => Number(part));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };
  const start = parse(initTime);
  const end = parse(endTime);
  if (start == null || end == null) return false;
  return end < start;
}

function formatAppointmentDateCell(
  date: string | null | undefined,
  initTime: string | null,
  endTime: string | null,
) {
  const startLabel = formatAppointmentDate(date);
  if (!date?.trim() || !isOvernightTimes(initTime, endTime)) return startLabel;
  return `${startLabel} → ${formatAppointmentDate(addDaysYmd(date.trim().slice(0, 10), 1))}`;
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

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type TicketMainView = "appointments" | "history";

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
  const [mainView, setMainView] = useState<TicketMainView>("appointments");
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [changeClientOpen, setChangeClientOpen] = useState(false);
  const [clientOptions, setClientOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [nextClientId, setNextClientId] = useState("");
  const [loadingClients, setLoadingClients] = useState(false);
  const [filterCatalogs, setFilterCatalogs] =
    useState<TicketFilterCatalogs | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!Number.isFinite(ticketNumber)) return;
    try {
      if (!silent) setLoading(true);
      const res = await ticketsService.detail(ticketNumber);
      setData(res);
      setHistoryRefreshToken((value) => value + 1);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível carregar o ticket.",
      );
    } finally {
      if (!silent) setLoading(false);
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
    void Promise.all([load(), loadStages()]);
  }, [load, loadStages]);

  useEffect(() => {
    if (!canChangeTicketStage()) return;
    let cancelled = false;
    void ticketsService
      .catalogs()
      .then((catalogs) => {
        if (!cancelled) setFilterCatalogs(catalogs);
      })
      .catch(() => {
        if (!cancelled) setFilterCatalogs(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setExternalGmudRefInput(data?.externalGmudRef ?? "");
  }, [data?.externalGmudRef]);

  const ticket = data?.ticket;
  const externalGmudRef = data?.externalGmudRef;
  const stageOptions = (stagesData?.stages ?? [])
    .filter(
      (stage) =>
        !stage.lastStage &&
        stage.name !== PORTAL_STAGE.ENCERRADO &&
        stage.name !== PORTAL_STAGE.CANCELADO,
    )
    .map((stage) => ({
      value: String(stage.id),
      label: stage.firstStage ? `${stage.name} (inicial)` : stage.name,
    }));
  const stageChanged =
    stageIdInput !== "" &&
    stagesData?.currentStageId != null &&
    Number(stageIdInput) !== stagesData.currentStageId;

  async function applyOptionsChange(patch?: TicketOptionsChange) {
    if (patch) {
      setData((prev) =>
        prev?.ticket
          ? {
              ...prev,
              ticket: {
                ...prev.ticket,
                ...(patch.isClosed != null ? { isClosed: patch.isClosed } : {}),
                ...(patch.stageName != null
                  ? { stageName: patch.stageName, statusName: patch.statusName ?? patch.stageName }
                  : {}),
                ...(patch.deskName != null
                  ? {
                      deskName: patch.deskName,
                      deskExternalId: patch.deskExternalId,
                    }
                  : {}),
              },
            }
          : prev,
      );
      if (patch.isClosed != null || patch.stageName != null) {
        setStagesData((prev) =>
          prev
            ? {
                ...prev,
                isClosed: patch.isClosed ?? prev.isClosed,
                currentStageName: patch.stageName ?? prev.currentStageName,
              }
            : prev,
        );
      }
    }
    setHistoryRefreshToken((value) => value + 1);
    await Promise.all([load(true), loadStages()]);
  }

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

  async function openChangeClientDialog() {
    setChangeClientOpen(true);
    setNextClientId("");
    setLoadingClients(true);
    try {
      const catalogs = await ticketsService.createCatalogs();
      setClientOptions(
        (catalogs.clients ?? []).map((c) => ({
          value: String(c.id),
          label: c.name,
        })),
      );
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar os clientes.",
      );
      setChangeClientOpen(false);
    } finally {
      setLoadingClients(false);
    }
  }

  async function confirmChangeClient() {
    const clientId = Number(nextClientId);
    if (!Number.isFinite(clientId) || clientId <= 0) {
      notifyError("Selecione o novo cliente.");
      return;
    }
    const ok = await confirm({
      title: "Trocar cliente do chamado?",
      description:
        "GMUD vinculada e dados do solicitante serão limpos. Confirme se o cliente está correto.",
      confirmText: "Trocar cliente",
    });
    if (!ok) return;
    try {
      setLifecycleBusy(true);
      await ticketsService.updateTicket(ticketNumber, { clientId });
      notifySuccess("Cliente do chamado atualizado.");
      setChangeClientOpen(false);
      await Promise.all([load(), loadStages()]);
      setHistoryRefreshToken((n) => n + 1);
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível trocar o cliente.",
      );
    } finally {
      setLifecycleBusy(false);
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
          TICKET_DELETE_APPOINTMENT_CONFIRM,
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
              {ticket && canChangeTicketStage() ? (
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link href={`/tickets/${ticket.ticketNumber}/edit`}>
                    <Pencil className="mr-2 size-4" />
                    Editar
                  </Link>
                </Button>
              ) : null}
              {ticket && canChangeTicketStage() ? (
                <TicketOptionsMenu
                  ticketNumber={ticket.ticketNumber}
                  isClosed={ticket.isClosed}
                  currentDeskId={ticket.deskExternalId}
                  disabled={lifecycleBusy}
                  onChanged={applyOptionsChange}
                />
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
                    {TICKET_SYNC_PENDING_BANNER}
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
                {data?.grouping?.parent ? (
                  <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                    Agrupado no chamado pai{" "}
                    <Link
                      href={`/tickets/${data.grouping.parent.ticketNumber}`}
                      className="font-medium text-primary hover:underline"
                    >
                      #{data.grouping.parent.ticketNumber}
                    </Link>
                    {data.grouping.parent.title
                      ? ` — ${data.grouping.parent.title}`
                      : ""}
                    .
                  </p>
                ) : null}
                {data?.grouping?.children?.length ? (
                  <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                    Chamados agrupados neste ticket:{" "}
                    {data.grouping.children.map((child, index) => (
                      <span key={child.ticketNumber}>
                        {index > 0 ? ", " : ""}
                        <Link
                          href={`/tickets/${child.ticketNumber}`}
                          className="font-medium text-primary hover:underline"
                        >
                          #{child.ticketNumber}
                        </Link>
                      </span>
                    ))}
                    .
                  </p>
                ) : null}

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
                      <CardContent className="space-y-4">
                        <AppointmentDescriptionView
                          description={data.portalDescription.description}
                          attachments={data.portalDescription.attachments ?? []}
                        />
                        {(data.portalDescription.attachments ?? []).some(
                          (a) => !(a.mimeType || "").startsWith("image/"),
                        ) ? (
                          <div className="space-y-2 border-t border-border pt-4">
                            <p className="text-sm font-medium">Anexos</p>
                            <ul className="space-y-1.5">
                              {(data.portalDescription.attachments ?? [])
                                .filter(
                                  (a) =>
                                    !(a.mimeType || "").startsWith("image/"),
                                )
                                .map((attachment) => (
                                  <li
                                    key={attachment.fileId}
                                    className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm"
                                  >
                                    <span className="min-w-0 flex-1 truncate">
                                      {attachment.originalName}
                                      <span className="text-muted-foreground">
                                        {` · ${attachment.mimeType || "arquivo"}`}
                                        {attachment.size != null
                                          ? ` · ${
                                              attachment.size < 1024
                                                ? `${attachment.size} B`
                                                : attachment.size < 1024 * 1024
                                                  ? `${Math.round(attachment.size / 1024)} KB`
                                                  : `${(attachment.size / (1024 * 1024)).toFixed(1)} MB`
                                            }`
                                          : ""}
                                      </span>
                                    </span>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-8"
                                      onClick={() =>
                                        void openPortalAttachment(
                                          attachment,
                                          false,
                                        ).catch((err) =>
                                          notifyError(
                                            err instanceof Error
                                              ? err.message
                                              : "Não foi possível baixar o anexo.",
                                          ),
                                        )
                                      }
                                    >
                                      <Download className="mr-1.5 size-3.5" />
                                      Baixar
                                    </Button>
                                  </li>
                                ))}
                            </ul>
                          </div>
                        ) : null}
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
                      {canChangeTicketStage() ? (
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold text-muted-foreground">
                            Responsável
                          </Label>
                          <TicketResponsibleSelect
                            ticketNumber={ticket.ticketNumber}
                            responsibleId={ticket.responsibleExternalId}
                            responsibleName={ticket.responsibleName}
                            options={mapFilterResponsibles(
                              filterCatalogs?.responsibles ?? [],
                            )}
                            disabled={ticket.isClosed}
                            onUpdated={(next) => {
                              setData((prev) =>
                                prev?.ticket
                                  ? {
                                      ...prev,
                                      ticket: {
                                        ...prev.ticket,
                                        responsibleExternalId:
                                          next.responsibleId,
                                        responsibleName: next.responsibleName,
                                      },
                                    }
                                  : prev,
                              );
                              setHistoryRefreshToken((value) => value + 1);
                            }}
                          />
                        </div>
                      ) : (
                        <p>
                          <span className="text-muted-foreground">
                            Responsável:{" "}
                          </span>
                          {ticket.responsibleName ?? "—"}
                        </p>
                      )}
                      {canChangeTicketStage() && (stagesLoading || stagesData) ? (
                        <div className="space-y-2 border-t border-border pt-3">
                          <Label className="text-xs font-semibold text-muted-foreground">
                            Estágio
                          </Label>
                          {ticket.isClosed || stagesData?.isClosed ? (
                            <p className="text-sm">
                              {ticket.stageName ?? stagesData?.currentStageName ?? "—"}
                              <span className="mt-1 block text-xs text-muted-foreground">
                                Chamado encerrado. Use Opções → Reabrir chamado.
                              </span>
                            </p>
                          ) : (
                            <>
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                                <div className="flex-1">
                                  <SearchableSelectField
                                    value={stageIdInput}
                                    onChange={setStageIdInput}
                                    options={stageOptions}
                                    loading={stagesLoading}
                                    disabled={stageSaving || stagesLoading}
                                    placeholder="Selecione o estágio"
                                    preserveOrder
                                  />
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-11 shrink-0"
                                  disabled={
                                    stageSaving || stagesLoading || !stageChanged
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
                                Andamento do atendimento. Fechar, cancelar e reabrir ficam em Opções.
                              </p>
                            </>
                          )}
                        </div>
                      ) : null}
                      {data.canChangeClient && !ticket.isClosed ? (
                        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9"
                            disabled={lifecycleBusy}
                            onClick={() => void openChangeClientDialog()}
                          >
                            Trocar cliente
                          </Button>
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

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={mainView === "appointments" ? "default" : "outline"}
                    onClick={() => setMainView("appointments")}
                  >
                    <Clock className="mr-1.5 h-3.5 w-3.5" />
                    Apontamentos
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={mainView === "history" ? "default" : "outline"}
                    onClick={() => setMainView("history")}
                  >
                    <History className="mr-1.5 h-3.5 w-3.5" />
                    Histórico
                  </Button>
                </div>

                {mainView === "history" ? (
                  <Card>
                    <CardContent className="pt-6">
                      <TicketHistoryPanel
                        ticketNumber={ticketNumber}
                        refreshToken={historyRefreshToken}
                      />
                    </CardContent>
                  </Card>
                ) : (
                <Card>
                  <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                    <div className="space-y-1">
                      <CardTitle className="text-base">Apontamentos</CardTitle>
                      {!canCreateTicketAppointment() ? (
                        <p className="text-xs font-normal text-muted-foreground">
                          {TICKETS_APPOINTMENT_CREATE_RESTRICTED}
                        </p>
                      ) : null}
                    </div>
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
                              colSpan={canCreateTicketAppointment() ? 7 : 6}
                              className="px-4 py-8 text-center text-muted-foreground"
                            >
                              Nenhum apontamento neste ticket.
                            </td>
                          </tr>
                        ) : (
                          data?.appointments.map((row) => {
                            return (
                            <tr
                              key={appointmentRowKey(row)}
                              className="border-b border-border/60 align-top"
                            >
                              <td className="px-4 py-2">
                                <div>{row.userName ?? "—"}</div>
                                {row.attachmentCount > 0 ? (
                                  <span className="mt-1 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                    {row.attachmentCount} anexo(s)
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-4 py-2">
                                {formatAppointmentDateCell(
                                  row.appointmentDate,
                                  row.initTime,
                                  row.endTime,
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2">
                                {row.initTime ?? "—"} – {row.endTime ?? "—"}
                              </td>
                              <td className="px-4 py-2">{formatMinutes(row.minutes)}</td>
                              <td className="px-4 py-2">{row.valorizationLabel ?? "—"}</td>
                              <td className="w-[240px] max-w-[240px] px-4 py-2">
                                <AppointmentDescriptionCell
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
                                    <DropdownMenu modal={false}>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="size-8"
                                          aria-label="Ações do apontamento"
                                        >
                                          <MoreVertical className="size-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent
                                        align="end"
                                        sideOffset={6}
                                        className="min-w-[9.5rem] w-auto"
                                      >
                                        <DropdownMenuItem
                                          onClick={() =>
                                            void handleEditAppointment(
                                              row.portalAppointmentId!,
                                            )
                                          }
                                        >
                                          <Pencil className="mr-2 size-4" />
                                          Editar
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          variant="destructive"
                                          onClick={() =>
                                            void handleDeleteAppointment(
                                              row.portalAppointmentId!,
                                            )
                                          }
                                        >
                                          <Trash2 className="mr-2 size-4" />
                                          Excluir
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  ) : (
                                    <span
                                      className="inline-flex max-w-[9rem] flex-col gap-0.5 text-xs text-muted-foreground"
                                      title={TICKET_APPOINTMENT_TIFLUX_ONLY_HINT}
                                    >
                                      <span className="rounded bg-sky-500/15 px-1.5 py-0.5 font-medium text-sky-800 dark:text-sky-200">
                                        {TICKET_APPOINTMENT_EXTERNAL_ONLY_BADGE}
                                      </span>
                                      <span className="leading-snug">
                                        {TICKET_APPOINTMENT_EXTERNAL_ONLY_ACTION}
                                      </span>
                                    </span>
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
                )}

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
                        void loadStages();
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

          <Dialog open={changeClientOpen} onOpenChange={setChangeClientOpen}>
            <DialogContent className="sm:max-w-md" showCloseButton>
              <DialogHeader>
                <DialogTitle>Trocar cliente do chamado</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Label>Novo cliente</Label>
                <SearchableSelectField
                  value={nextClientId}
                  onChange={setNextClientId}
                  options={clientOptions}
                  loading={loadingClients}
                  placeholder="Selecione o cliente"
                  emptyLabel="Nenhum cliente"
                />
                <p className="text-xs text-muted-foreground">
                  GMUD e solicitante atuais serão limpos após a troca.
                </p>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setChangeClientOpen(false)}
                >
                  Fechar
                </Button>
                <Button
                  type="button"
                  disabled={lifecycleBusy || !nextClientId}
                  onClick={() => void confirmChangeClient()}
                >
                  Confirmar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
