"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, User2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AppointmentDescriptionComposer,
  type AppointmentBlockComposerHandle,
} from "@/components/tickets/appointment-description-composer";
import { canChangeTicketStage } from "@/lib/access-control";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  ticketsService,
  type AppointmentCatalogs,
  type CreateAppointmentPayload,
  type PortalAppointmentEditContext,
} from "@/lib/services/tickets.service";
import { useAuth } from "@/lib/use-auth";

const SERVICE_TYPES = ["HORA NORMAL", "HORA EXTRA", "PLANTÃO"] as const;

const DEFAULT_ATTENDANCE = "Remote" as const;

const FIELD_LABEL = "font-sans text-sm font-semibold text-foreground";
const FIELD_INPUT = "font-sans h-11";

type SaveMode = "save" | "saveAndAnother" | "saveAndClose";

type Props = {
  ticketNumber: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  editingAppointment?: PortalAppointmentEditContext | null;
  /** Quando definido, vincula automaticamente à atividade e oculta o seletor. */
  fixedActivityId?: string;
};

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function addMinutesToTime(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map((part) => Number(part));
  const base =
    (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  const total = ((base + minutes) % (24 * 60) + 24 * 60) % (24 * 60);
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((part) => Number(part));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function TicketAppointmentModal({
  ticketNumber,
  open,
  onOpenChange,
  onCreated,
  editingAppointment = null,
  fixedActivityId,
}: Props) {
  const isEdit = Boolean(editingAppointment?.portalAppointmentId);
  const { user } = useAuth();
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ticketMeta, setTicketMeta] = useState<AppointmentCatalogs["ticket"] | null>(null);
  const [projectLink, setProjectLink] = useState<AppointmentCatalogs["projectLink"]>(null);
  const [ticketClosed, setTicketClosed] = useState(false);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [initTime, setInitTime] = useState(nowTime);
  const [endTime, setEndTime] = useState(() => addMinutesToTime(nowTime(), 15));
  const [serviceName, setServiceName] = useState("");
  const [projectActivityId, setProjectActivityId] = useState("");
  const composerRef = useRef<AppointmentBlockComposerHandle>(null);
  const [composerKey, setComposerKey] = useState(0);
  const saveModeRef = useRef<SaveMode>("save");

  const serviceTypeOptions = useMemo(
    () => SERVICE_TYPES.map((s) => ({ value: s, label: s })),
    [],
  );

  const canCloseTicket = canChangeTicketStage() && !ticketClosed;

  const loadTicketMeta = useCallback(async () => {
    try {
      setLoadingMeta(true);
      const [data, stages] = await Promise.all([
        ticketsService.appointmentCatalogs(ticketNumber),
        canChangeTicketStage()
          ? ticketsService.listStages(ticketNumber).catch(() => null)
          : Promise.resolve(null),
      ]);
      setTicketMeta(data.ticket);
      setProjectLink(data.projectLink ?? null);
      setTicketClosed(Boolean(stages?.isClosed));
    } catch {
      setTicketMeta(null);
      setTicketClosed(false);
    } finally {
      setLoadingMeta(false);
    }
  }, [ticketNumber]);

  useEffect(() => {
    if (open) {
      if (editingAppointment) {
        setDate(editingAppointment.date);
        setInitTime(editingAppointment.initTime);
        setEndTime(editingAppointment.endTime);
        setServiceName(editingAppointment.serviceName);
        setComposerKey((k) => k + 1);
      } else {
        const start = nowTime();
        setInitTime(start);
        setEndTime(addMinutesToTime(start, 15));
        setProjectActivityId(fixedActivityId ?? "");
        setComposerKey((k) => k + 1);
      }
      void loadTicketMeta();
    }
  }, [open, loadTicketMeta, editingAppointment, fixedActivityId]);

  const projectActivityOptions = useMemo(
    () => [
      { value: "", label: "Sem vínculo com atividade do projeto" },
      ...(projectLink?.activities ?? []).map((item) => ({
        value: item.id,
        label: item.label,
      })),
    ],
    [projectLink],
  );

  function resetFormForAnotherAppointment(previousEndTime: string) {
    setInitTime(previousEndTime);
    setEndTime(addMinutesToTime(previousEndTime, 15));
    setComposerKey((k) => k + 1);
  }

  async function closeTicketAfterAppointment() {
    const stages = await ticketsService.listStages(ticketNumber);
    if (stages.isClosed) {
      setTicketClosed(true);
      return;
    }
    const lastStage =
      stages.stages.find((stage) => stage.lastStage) ??
      stages.stages[stages.stages.length - 1];
    if (!lastStage) {
      throw new Error("Não há estágio de fechamento configurado para este ticket.");
    }
    const result = await ticketsService.updateStage(ticketNumber, lastStage.id);
    setTicketClosed(true);
    return result;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const mode = saveModeRef.current;
    saveModeRef.current = "save";

    if (!serviceName.trim()) {
      notifyError("Selecione o tipo de atendimento.");
      return;
    }
    if (timeToMinutes(endTime) <= timeToMinutes(initTime)) {
      notifyError("Horário final deve ser maior que o horário inicial.");
      return;
    }
    const exported = composerRef.current?.exportContent();
    if (!exported?.isValid) {
      notifyError("Informe a descrição do apontamento (texto e/ou imagens).");
      return;
    }

    const payload: CreateAppointmentPayload = {
      date,
      initTime,
      endTime,
      description: exported.description,
      serviceName: serviceName.trim(),
      attendance: DEFAULT_ATTENDANCE,
      ...(projectActivityId ? { projectActivityId } : {}),
      ...(isEdit
        ? { removeAttachmentFileIds: exported.removeAttachmentFileIds }
        : {}),
    };

    try {
      setSaving(true);
      const res = isEdit
        ? await ticketsService.updateAppointment(
            ticketNumber,
            editingAppointment!.portalAppointmentId,
            payload,
            exported.files,
          )
        : await ticketsService.createAppointment(
            ticketNumber,
            payload,
            exported.files,
          );

      if (!isEdit && mode === "saveAndClose") {
        try {
          const closeRes = await closeTicketAfterAppointment();
          notifySuccess(
            closeRes?.message
              ? `${res.message} ${closeRes.message}`
              : `${res.message} Ticket fechado.`,
          );
        } catch (closeErr) {
          notifySuccess(res.message);
          notifyError(
            closeErr instanceof Error
              ? `Apontamento salvo, mas não foi possível fechar o ticket: ${closeErr.message}`
              : "Apontamento salvo, mas não foi possível fechar o ticket.",
          );
          onCreated?.();
          onOpenChange(false);
          return;
        }
        onCreated?.();
        onOpenChange(false);
        return;
      }

      notifySuccess(res.message);

      if (!isEdit && mode === "saveAndAnother") {
        resetFormForAnotherAppointment(endTime);
        onCreated?.();
        return;
      }

      if (!isEdit) {
        setServiceName("");
      }
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível criar o apontamento.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        aria-describedby={undefined}
        className="flex h-full w-full max-w-none flex-col gap-0 p-0 sm:max-w-none md:w-[min(960px,68vw)] lg:w-[min(1100px,72vw)]"
      >
        <SheetHeader className="shrink-0 space-y-3 border-b border-border px-6 py-5 pr-14">
          <SheetTitle className="text-lg font-bold">
            {isEdit
              ? `Editar apontamento · ticket #${ticketNumber}`
              : `Apontar no ticket #${ticketNumber}`}
          </SheetTitle>
          {loadingMeta ? (
            <SheetDescription>Carregando dados do ticket…</SheetDescription>
          ) : ticketMeta ? (
            <SheetDescription>
              {ticketMeta.clientName ?? "—"} · {ticketMeta.deskName ?? "—"}
              {ticketClosed ? " · Ticket fechado" : ""}
            </SheetDescription>
          ) : null}

          {user ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <User2 className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Você está apontando como</p>
                <p className="truncate text-sm font-bold text-foreground">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
            </div>
          ) : null}
        </SheetHeader>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label className={FIELD_LABEL}>Dia *</Label>
                <DatePickerField
                  value={date}
                  onChange={setDate}
                  modal
                  className="h-11 rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label className={FIELD_LABEL}>Início *</Label>
                <Input
                  type="time"
                  value={initTime}
                  onChange={(e) => {
                    const next = e.target.value;
                    setInitTime(next);
                    if (timeToMinutes(endTime) <= timeToMinutes(next)) {
                      setEndTime(addMinutesToTime(next, 15));
                    }
                  }}
                  className={FIELD_INPUT}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className={FIELD_LABEL}>Fim *</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={FIELD_INPUT}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className={FIELD_LABEL}>Tipo de atendimento *</Label>
              <SearchableSelectField
                value={serviceName}
                onChange={setServiceName}
                options={serviceTypeOptions}
                placeholder="Selecione"
                emptyLabel="Selecione"
                modal
              />
            </div>

            {!isEdit && fixedActivityId ? (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                O apontamento será vinculado automaticamente à atividade selecionada no
                cronograma.
              </div>
            ) : null}

            {!isEdit && !fixedActivityId && projectLink?.activities.length ? (
              <div className="space-y-2">
                <Label className={FIELD_LABEL}>
                  Atividade do projeto {projectLink.project.name}
                </Label>
                <SearchableSelectField
                  value={projectActivityId}
                  onChange={setProjectActivityId}
                  options={projectActivityOptions}
                  preserveOrder
                  placeholder="Opcional"
                  emptyLabel="Sem vínculo"
                  modal
                />
                <p className="text-xs text-muted-foreground">
                  Se escolher uma atividade, o tempo abate no cronograma e o responsável
                  é atualizado automaticamente.
                </p>
              </div>
            ) : null}

            <AppointmentDescriptionComposer
              key={composerKey}
              ref={composerRef}
              disabled={saving}
              labelClassName={FIELD_LABEL}
              hintText=""
              initialDescription={
                isEdit ? editingAppointment?.description ?? null : null
              }
              initialAttachments={
                isEdit ? editingAppointment?.attachments ?? [] : []
              }
            />
          </div>

          <SheetFooter className="shrink-0 flex-col gap-2 border-t border-border px-6 py-4 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            {!isEdit ? (
              <>
                <Button
                  type="submit"
                  variant="outline"
                  className="h-11"
                  disabled={saving}
                  onClick={() => {
                    saveModeRef.current = "saveAndAnother";
                  }}
                >
                  {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Salvar e fazer outro
                </Button>
                {canCloseTicket ? (
                  <Button
                    type="submit"
                    variant="outline"
                    className="h-11"
                    disabled={saving}
                    onClick={() => {
                      saveModeRef.current = "saveAndClose";
                    }}
                  >
                    {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    Salvar e fechar ticket
                  </Button>
                ) : null}
              </>
            ) : null}
            <Button
              type="submit"
              className="h-11 min-w-[120px]"
              disabled={saving}
              onClick={() => {
                saveModeRef.current = "save";
              }}
            >
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {saving
                ? "Salvando..."
                : isEdit
                  ? "Salvar alterações"
                  : "Salvar"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
