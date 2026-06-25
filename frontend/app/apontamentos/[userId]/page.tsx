"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";

import AppShell from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TimePickerField } from "@/components/ui/datetime-picker-field";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";
import { isPjRole } from "@/lib/app-roles";
import {
  canCreateAlertRendimentoJustification,
  canCreateVoluntaryRendimentoJustification,
} from "@/lib/access-control";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/confirm";
import {
  isInvalidSameTimePeriod,
  isPeriodWithinAlertBounds,
  minutesBetweenClockTimes,
} from "@/lib/rendimento/alert-period";
import {
  RENDIMENTO_LUNCH_MAX_MINUTES,
  rendimentoLunchMaxLabel,
} from "@/lib/rendimento/constants";
import {
  APONTAMENTOS_AGENDA_SUBTITLE,
  APONTAMENTOS_PJ_SUBTITLE,
  RENDIMENTO_DEBIT_OVERTIME_LABEL,
  RENDIMENTO_DEFINE_LUNCH_HINT,
  RENDIMENTO_JUSTIFICATION_ALERT_DESC,
  RENDIMENTO_JUSTIFICATION_VOLUNTARY_DESC,
} from "@/lib/module-copy";
import { getStoredUser } from "@/lib/session";
import { isValidUuid } from "@/lib/selected-company";
import { useAuth } from "@/lib/use-auth";
import {
  RendimentoCalendar,
  toDateInputValue,
} from "@/components/rendimento/rendimento-calendar";
import {
  rendimentoService,
  type RendimentoCalendarView,
  type RendimentoTimesheet,
} from "@/lib/services/rendimento.service";

function parseTimeToMinutes(value: string): number | null {
  if (!value?.trim()) return null;
  const [h, m] = value.split(":").map((part) => Number(part.trim()));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return (h || 0) * 60 + (m || 0);
}

function minutesBetweenTimes(from: string, to: string): number {
  return minutesBetweenClockTimes(from, to);
}

export default function RendimentoAgendaPage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const { user: authUser } = useAuth();
  const confirm = useConfirm();
  const userId = isValidUuid(params.userId) ? params.userId : null;

  useEffect(() => {
    if (!authUser) return;
    if (!userId) {
      router.replace(`/apontamentos/${authUser.id}`);
      return;
    }
    if (authUser.role !== "ADMIN" && authUser.id !== userId) {
      router.replace(`/apontamentos/${authUser.id}`);
    }
  }, [authUser, userId, router]);

  const [view, setView] = useState<RendimentoCalendarView>("month");
  const [referenceDate, setReferenceDate] = useState(() => new Date());
  const [timesheet, setTimesheet] = useState<RendimentoTimesheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadSeqRef = useRef(0);
  const hasTimesheetRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [justModalOpen, setJustModalOpen] = useState(false);
  const [justMode, setJustMode] = useState<"ALERT" | "VOLUNTARY">("ALERT");
  const [justDate, setJustDate] = useState("");
  const [justFrom, setJustFrom] = useState("");
  const [justTo, setJustTo] = useState("");
  const [justAlertFrom, setJustAlertFrom] = useState("");
  const [justAlertTo, setJustAlertTo] = useState("");
  const [justAlertGapMinutes, setJustAlertGapMinutes] = useState(0);
  const [defineLunch, setDefineLunch] = useState(false);
  const [justReason, setJustReason] = useState("");
  const [debitOvertime, setDebitOvertime] = useState(false);
  const [justEditingId, setJustEditingId] = useState<string | null>(null);
  const authUserResolved = authUser ?? getStoredUser();
  const isPjUser = isPjRole(authUserResolved?.role);
  const canApprove = authUserResolved?.role === "ADMIN";
  const canVoluntaryJustification =
    !isPjUser && canCreateVoluntaryRendimentoJustification();
  const canDeleteOwnJustification =
    authUserResolved?.id === userId && canVoluntaryJustification;
  const canAlertJustification =
    !isPjUser && canCreateAlertRendimentoJustification();

  const justGapMinutes = useMemo(
    () => minutesBetweenTimes(justFrom, justTo),
    [justFrom, justTo],
  );
  const invalidTimeRange = useMemo(
    () => isInvalidSameTimePeriod(justFrom, justTo),
    [justFrom, justTo],
  );
  const lunchTooLong =
    justMode === "ALERT" &&
    defineLunch &&
    justGapMinutes > RENDIMENTO_LUNCH_MAX_MINUTES;
  const alertPeriodOutOfBounds = useMemo(() => {
    if (justMode !== "ALERT" || !justAlertFrom || !justAlertTo) return false;
    if (!justFrom.trim() || !justTo.trim()) return false;
    return !isPeriodWithinAlertBounds({
      from: justFrom,
      to: justTo,
      alertFrom: justAlertFrom,
      alertTo: justAlertTo,
      alertGapMinutes: justAlertGapMinutes,
    });
  }, [
    justAlertFrom,
    justAlertGapMinutes,
    justAlertTo,
    justFrom,
    justMode,
    justTo,
  ]);

  const loadTimesheet = useCallback(async () => {
    if (!userId) return;
    const seq = ++loadSeqRef.current;
    const isFirstLoad = !hasTimesheetRef.current;
    try {
      if (isFirstLoad) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      const data = await rendimentoService.getTimesheet({
        userId,
        view,
        date: toDateInputValue(referenceDate),
      });
      if (seq !== loadSeqRef.current) return;
      setTimesheet(data);
      hasTimesheetRef.current = true;
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar a agenda de horas.",
      );
      if (isFirstLoad) {
        setTimesheet(null);
        hasTimesheetRef.current = false;
      }
    } finally {
      if (seq !== loadSeqRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [referenceDate, userId, view]);

  useEffect(() => {
    void loadTimesheet();
  }, [loadTimesheet]);

  function openAlertJustification(params: {
    date: string;
    fromTime: string;
    toTime: string;
    gapMinutes: number;
    gapType: "idle" | "lunch";
  }) {
    setJustEditingId(null);
    setJustMode("ALERT");
    setJustDate(params.date);
    setJustFrom(params.fromTime);
    setJustTo(params.toTime);
    setJustAlertFrom(params.fromTime);
    setJustAlertTo(params.toTime);
    setJustAlertGapMinutes(params.gapMinutes);
    setDefineLunch(params.gapType === "lunch");
    setJustReason("");
    setDebitOvertime(false);
    setJustModalOpen(true);
  }

  function openVoluntaryJustification(params: { date: string }) {
    setJustEditingId(null);
    setJustMode("VOLUNTARY");
    setJustDate(params.date);
    setJustFrom("08:00");
    setJustTo("09:00");
    setJustAlertFrom("");
    setJustAlertTo("");
    setJustAlertGapMinutes(0);
    setDefineLunch(false);
    setJustReason("");
    setDebitOvertime(false);
    setJustModalOpen(true);
  }

  function openEditJustification(params: {
    id: string;
    kind: "ALERT" | "VOLUNTARY";
    date: string;
    fromTime: string;
    toTime: string;
    gapType?: "idle" | "lunch";
    reason: string;
    alertFromTime?: string;
    alertToTime?: string;
  }) {
    setJustEditingId(params.id);
    setJustMode(params.kind);
    setJustDate(params.date.slice(0, 10));
    setJustFrom(params.fromTime.slice(0, 5));
    setJustTo(params.toTime.slice(0, 5));
    setJustAlertFrom(params.alertFromTime?.slice(0, 5) ?? "");
    setJustAlertTo(params.alertToTime?.slice(0, 5) ?? "");
    setDefineLunch(params.gapType === "lunch");
    setJustReason(params.reason);
    setDebitOvertime(false);
    setJustModalOpen(true);
  }

  async function submitJustification() {
    if (!userId) return;
    if (!justReason.trim()) {
      notifyError("Informe a justificativa.");
      return;
    }
    if (invalidTimeRange) {
      notifyError(
        "Informe horários válidos. Se o expediente cruza a meia-noite (ex.: 23:00 até 07:00), use o horário do dia seguinte no campo fim.",
      );
      return;
    }
    if (lunchTooLong) {
      notifyError(
        `O período de almoço não pode exceder ${rendimentoLunchMaxLabel()}.`,
      );
      return;
    }
    if (alertPeriodOutOfBounds) {
      notifyError("O período deve estar dentro do alerta selecionado.");
      return;
    }
    try {
      setSaving(true);
      if (justEditingId) {
        await rendimentoService.updateJustification({
          id: justEditingId,
          date: justMode === "VOLUNTARY" ? justDate : undefined,
          fromTime: justFrom,
          toTime: justTo,
          reason: justReason.trim(),
          alertFromTime:
            justMode === "ALERT" && justAlertFrom ? justAlertFrom : undefined,
          alertToTime:
            justMode === "ALERT" && justAlertTo ? justAlertTo : undefined,
        });
        setJustModalOpen(false);
        setJustEditingId(null);
        notifySuccess("Justificativa atualizada.");
        await loadTimesheet();
        return;
      }

      const gapMinutes = minutesBetweenTimes(justFrom, justTo);
      await rendimentoService.createJustification({
        userId,
        date: justDate,
        fromTime: justFrom,
        toTime: justTo,
        gapType:
          justMode === "VOLUNTARY" ? "idle" : defineLunch ? "lunch" : "idle",
        gapMinutes,
        kind: justMode,
        reason: justReason.trim(),
        debitOvertime,
        alertFromTime:
          justMode === "ALERT" && justAlertFrom ? justAlertFrom : undefined,
        alertToTime:
          justMode === "ALERT" && justAlertTo ? justAlertTo : undefined,
      });
      setJustModalOpen(false);
      notifySuccess("Justificativa enviada para aprovação.");
      await loadTimesheet();
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível salvar justificativa.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function decideDayEvent(id: string, decision: "APPROVED" | "REJECTED") {
    try {
      await rendimentoService.decideDayEvent({ id, decision });
      notifySuccess(
        decision === "APPROVED"
          ? "Registro aprovado."
          : "Registro não aprovado.",
      );
      await loadTimesheet();
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível decidir o registro.",
      );
    }
  }

  async function decideJustification(id: string, decision: "APPROVED" | "REJECTED") {
    try {
      await rendimentoService.decideJustification({ id, decision });
      notifySuccess(
        decision === "APPROVED"
          ? "Justificativa aprovada."
          : "Justificativa não aprovada.",
      );
      await loadTimesheet();
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível decidir justificativa.",
      );
    }
  }

  async function deleteJustification(id: string) {
    const ok = await confirm({
      title: "Excluir justificativa",
      description:
        "O registro será removido da agenda e não poderá ser recuperado.",
      confirmText: "Excluir",
      variant: "error",
    });
    if (!ok) return;
    try {
      await rendimentoService.deleteJustification(id);
      notifySuccess("Justificativa excluída.");
      await loadTimesheet();
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível excluir.",
      );
    }
  }

  return (
    <ProtectedPage>
      <PermissionGate module="RENDIMENTO">
        <AppShell>
          <div className="font-sans w-full space-y-8">
            <PageHeader
              icon={<CalendarDays size={24} />}
              title="Apontamentos"
              description={`${timesheet?.userName ?? "Colaborador"} · ${
                isPjUser ? APONTAMENTOS_PJ_SUBTITLE : APONTAMENTOS_AGENDA_SUBTITLE
              }`}
              backHref={!isPjUser ? "/apontamentos" : undefined}
              backLabel="Voltar à lista"
            />

            <RendimentoCalendar
              timesheet={timesheet}
              view={view}
              referenceDate={referenceDate}
              loading={loading}
              refreshing={refreshing}
              pjSimplifiedView={isPjUser}
              canApproveJustification={canApprove}
              canDeleteOwnJustification={canDeleteOwnJustification}
              onOpenAlertJustification={
                canAlertJustification ? openAlertJustification : undefined
              }
              onOpenVoluntaryJustification={
                canVoluntaryJustification ? openVoluntaryJustification : undefined
              }
              onApproveJustification={(id) => void decideJustification(id, "APPROVED")}
              onRejectJustification={(id) => void decideJustification(id, "REJECTED")}
              onDeleteJustification={(id) => void deleteJustification(id)}
              onEditJustification={(params) => openEditJustification(params)}
              canEditJustification={
                canAlertJustification || canDeleteOwnJustification || canApprove
              }
              onApproveDayEvent={(id) => void decideDayEvent(id, "APPROVED")}
              onRejectDayEvent={(id) => void decideDayEvent(id, "REJECTED")}
              onViewChange={setView}
              onReferenceDateChange={setReferenceDate}
            />
            <Dialog open={justModalOpen} onOpenChange={setJustModalOpen}>
              <DialogContent className="font-sans max-w-xl border-border bg-card text-card-foreground">
                <DialogHeader>
                  <DialogTitle>
                    {justEditingId
                      ? justMode === "ALERT"
                        ? "Editar justificativa de alerta"
                        : "Editar justificativa voluntária"
                      : justMode === "ALERT"
                        ? "Justificar alerta de lacuna"
                        : "Justificativa voluntária"}
                  </DialogTitle>
                  <DialogDescription>
                    {justMode === "VOLUNTARY"
                      ? RENDIMENTO_JUSTIFICATION_VOLUNTARY_DESC
                      : RENDIMENTO_JUSTIFICATION_ALERT_DESC}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">
                        Data
                      </Label>
                      <DatePickerField
                        value={justDate}
                        onChange={setJustDate}
                        modal
                        disabled={justMode === "ALERT"}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          Início
                        </Label>
                        <TimePickerField
                          value={justFrom}
                          onChange={setJustFrom}
                          disabled={!justDate}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          Fim
                        </Label>
                        <TimePickerField
                          value={justTo}
                          onChange={setJustTo}
                          disabled={!justDate}
                        />
                      </div>
                    </div>
                    {justMode === "ALERT" && justAlertFrom && justAlertTo ? (
                      <p className="text-xs text-muted-foreground">
                        Alerta: {justAlertFrom} – {justAlertTo}. Ajuste início e
                        fim para o trecho que deseja justificar (parcial é
                        permitido).
                      </p>
                    ) : null}
                  </div>
                    {alertPeriodOutOfBounds ? (
                    <p className="text-xs font-medium text-rose-500">
                      O período deve estar dentro do alerta (
                      {justAlertFrom} – {justAlertTo}
                      {justAlertGapMinutes > 0 &&
                      parseTimeToMinutes(justAlertTo) !== null &&
                      parseTimeToMinutes(justAlertFrom) !== null &&
                      (parseTimeToMinutes(justAlertTo) ?? 0) <=
                        (parseTimeToMinutes(justAlertFrom) ?? 0)
                        ? ` · ${justAlertGapMinutes} min`
                        : ""}
                      ). Para outro horário do dia (ex.: trabalhou cedo sem
                      ticket), feche e use{" "}
                      <span className="font-semibold">Justificativa voluntária</span>.
                    </p>
                  ) : null}
                  {invalidTimeRange ? (
                    <p className="text-xs font-medium text-rose-500">
                      Horário inválido ou início igual ao fim. Expediente
                      noturno: informe o fim no dia seguinte (ex.: início 23:00,
                      fim 07:00).
                    </p>
                  ) : null}
                  {lunchTooLong ? (
                    <p className="text-xs font-medium text-rose-500">
                      O intervalo de almoço não pode ultrapassar{" "}
                      {rendimentoLunchMaxLabel()}.
                    </p>
                  ) : null}
                  <Textarea
                    value={justReason}
                    onChange={(e) => setJustReason(e.target.value)}
                    placeholder="Descreva a justificativa (ex.: consulta médica)."
                    className="min-h-[120px]"
                  />
                  {justMode === "ALERT" && !justEditingId ? (
                    <label className="flex items-start gap-2 text-sm text-foreground">
                      <FlipCheckbox
                        checked={defineLunch}
                        onChange={(e) => setDefineLunch(e.target.checked)}
                      />
                      <span>
                        Definir almoço
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {RENDIMENTO_DEFINE_LUNCH_HINT}
                        </span>
                      </span>
                    </label>
                  ) : null}
                  {!justEditingId ? (
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <FlipCheckbox
                        checked={debitOvertime}
                        onChange={(e) => setDebitOvertime(e.target.checked)}
                      />
                      {RENDIMENTO_DEBIT_OVERTIME_LABEL}
                    </label>
                  ) : null}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setJustModalOpen(false);
                        setJustEditingId(null);
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      disabled={saving || invalidTimeRange || lunchTooLong || alertPeriodOutOfBounds}
                      onClick={() => void submitJustification()}
                    >
                      {saving
                        ? "Salvando..."
                        : justEditingId
                          ? "Salvar alterações"
                          : "Salvar justificativa"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

          </div>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
