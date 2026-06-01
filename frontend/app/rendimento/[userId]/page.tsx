"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import AppShell from "@/components/layout/app-shell";
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
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  RENDIMENTO_LUNCH_MAX_MINUTES,
  rendimentoLunchMaxLabel,
} from "@/lib/rendimento/constants";
import { getStoredUser } from "@/lib/session";
import {
  RendimentoCalendar,
  toDateInputValue,
} from "@/components/rendimento/rendimento-calendar";
import {
  rendimentoService,
  type RendimentoCalendarView,
  type RendimentoTimesheet,
} from "@/lib/services/rendimento.service";

function minutesBetweenTimes(from: string, to: string): number {
  const parse = (value: string) => {
    const [h, m] = value.split(":").map((part) => Number(part));
    return (h || 0) * 60 + (m || 0);
  };
  const diff = parse(to) - parse(from);
  return diff > 0 ? diff : 1;
}

export default function RendimentoAgendaPage() {
  const router = useRouter();
  const params = useParams<{ userId: string }>();
  const userId = params.userId;

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
  const [defineLunch, setDefineLunch] = useState(false);
  const [justReason, setJustReason] = useState("");
  const [debitOvertime, setDebitOvertime] = useState(false);
  const authUser = getStoredUser();
  const canApprove = authUser?.role === "ADMIN";

  const justGapMinutes = useMemo(
    () => minutesBetweenTimes(justFrom, justTo),
    [justFrom, justTo],
  );
  const isLunchGap = defineLunch || justMode === "VOLUNTARY";
  const lunchTooLong =
    isLunchGap && justGapMinutes > RENDIMENTO_LUNCH_MAX_MINUTES;

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
    if (isPjRole(authUser?.role)) {
      router.replace("/dashboard");
      return;
    }
    void loadTimesheet();
  }, [authUser?.role, loadTimesheet, router]);

  function openAlertJustification(params: {
    date: string;
    fromTime: string;
    toTime: string;
    gapMinutes: number;
    gapType: "idle" | "lunch";
  }) {
    setJustMode("ALERT");
    setJustDate(params.date);
    setJustFrom(params.fromTime);
    setJustTo(params.toTime);
    setDefineLunch(params.gapType === "lunch");
    setJustReason("");
    setDebitOvertime(false);
    setJustModalOpen(true);
  }

  function openVoluntaryJustification(params: { date: string }) {
    setJustMode("VOLUNTARY");
    setJustDate(params.date);
    setJustFrom("12:00");
    setJustTo("13:30");
    setDefineLunch(true);
    setJustReason("");
    setDebitOvertime(false);
    setJustModalOpen(true);
  }

  async function submitJustification() {
    if (!userId) return;
    if (!justReason.trim()) {
      notifyError("Informe a justificativa.");
      return;
    }
    if (lunchTooLong) {
      notifyError(
        `O período de almoço não pode exceder ${rendimentoLunchMaxLabel()}.`,
      );
      return;
    }
    try {
      setSaving(true);
      const gapMinutes = minutesBetweenTimes(justFrom, justTo);
      await rendimentoService.createJustification({
        userId,
        date: justDate,
        fromTime: justFrom,
        toTime: justTo,
        gapType: defineLunch ? "lunch" : "idle",
        gapMinutes,
        kind: justMode,
        reason: justReason.trim(),
        debitOvertime,
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
          ? "Hora extra/plantão aprovado (protegido contra débito)."
          : "Registro rejeitado.",
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
          : "Justificativa rejeitada.",
      );
      await loadTimesheet();
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível decidir justificativa.",
      );
    }
  }

  return (
    <ProtectedPage>
      <PermissionGate module="RENDIMENTO">
        <AppShell>
          <div className="font-sans w-full space-y-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <Button asChild variant="outline" size="sm" className="w-fit">
                  <Link href="/rendimento">
                    <ArrowLeft className="mr-2 size-4" />
                    Voltar à lista
                  </Link>
                </Button>
                <h1 className="text-3xl font-bold text-foreground">
                  Agenda de horas
                </h1>
                <p className="text-muted-foreground">
                  {timesheet?.userName ?? "Colaborador"} · apontamentos TiFlux
                </p>
              </div>
            </div>

            <RendimentoCalendar
              timesheet={timesheet}
              view={view}
              referenceDate={referenceDate}
              loading={loading}
              refreshing={refreshing}
              canApproveJustification={canApprove}
              onOpenAlertJustification={openAlertJustification}
              onOpenVoluntaryJustification={openVoluntaryJustification}
              onApproveJustification={(id) => void decideJustification(id, "APPROVED")}
              onRejectJustification={(id) => void decideJustification(id, "REJECTED")}
              onApproveDayEvent={(id) => void decideDayEvent(id, "APPROVED")}
              onRejectDayEvent={(id) => void decideDayEvent(id, "REJECTED")}
              onViewChange={setView}
              onReferenceDateChange={setReferenceDate}
            />
            <Dialog open={justModalOpen} onOpenChange={setJustModalOpen}>
              <DialogContent className="font-sans max-w-xl border-border bg-card text-card-foreground">
                <DialogHeader>
                  <DialogTitle>
                    {justMode === "ALERT"
                      ? "Justificar alerta de lacuna"
                      : "Justificativa voluntária"}
                  </DialogTitle>
                  <DialogDescription>
                    As justificativas ficam auditáveis e podem debitar horas extras após
                    aprovação do administrador.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">
                        Data
                      </Label>
                      <DatePickerField
                        value={justDate}
                        onChange={setJustDate}
                        modal
                      />
                    </div>
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
                  {lunchTooLong ? (
                    <p className="text-xs font-medium text-rose-500">
                      O intervalo de almoço não pode ultrapassar {rendimentoLunchMaxLabel()}.
                    </p>
                  ) : null}
                  <Textarea
                    value={justReason}
                    onChange={(e) => setJustReason(e.target.value)}
                    placeholder="Descreva a justificativa (ex.: consulta médica)."
                    className="min-h-[120px]"
                  />
                  {justMode === "ALERT" ? (
                    <label className="flex items-start gap-2 text-sm text-foreground">
                      <FlipCheckbox
                        checked={defineLunch}
                        onChange={(e) => setDefineLunch(e.target.checked)}
                      />
                      <span>
                        Definir almoço
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          Marque se este intervalo é almoço e o sistema marcou como alerta por engano.
                          Desmarque se não for almoço.
                        </span>
                      </span>
                    </label>
                  ) : null}
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <FlipCheckbox
                      checked={debitOvertime}
                      onChange={(e) => setDebitOvertime(e.target.checked)}
                    />
                    Debitar horas extras
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setJustModalOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      disabled={saving || lunchTooLong}
                      onClick={() => void submitJustification()}
                    >
                      {saving ? "Salvando..." : "Salvar justificativa"}
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
