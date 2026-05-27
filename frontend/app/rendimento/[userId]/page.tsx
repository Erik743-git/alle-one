"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";
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

export default function RendimentoAgendaPage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;

  const [view, setView] = useState<RendimentoCalendarView>("month");
  const [referenceDate, setReferenceDate] = useState(() => new Date());
  const [timesheet, setTimesheet] = useState<RendimentoTimesheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [justModalOpen, setJustModalOpen] = useState(false);
  const [justMode, setJustMode] = useState<"ALERT" | "VOLUNTARY">("ALERT");
  const [justDate, setJustDate] = useState("");
  const [justFrom, setJustFrom] = useState("");
  const [justTo, setJustTo] = useState("");
  const [justGapType, setJustGapType] = useState<"idle" | "lunch">("idle");
  const [justGapMinutes, setJustGapMinutes] = useState(60);
  const [justReason, setJustReason] = useState("");
  const [debitOvertime, setDebitOvertime] = useState(false);
  const [debitMinutes, setDebitMinutes] = useState(60);
  const authUser = getStoredUser();
  const canApprove = authUser?.role === "ADMIN";

  const loadTimesheet = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      setError("");
      const data = await rendimentoService.getTimesheet({
        userId,
        view,
        date: toDateInputValue(referenceDate),
      });
      setTimesheet(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar a agenda de horas.",
      );
      setTimesheet(null);
    } finally {
      setLoading(false);
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
    setJustMode("ALERT");
    setJustDate(params.date);
    setJustFrom(params.fromTime);
    setJustTo(params.toTime);
    setJustGapType(params.gapType);
    setJustGapMinutes(params.gapMinutes);
    setDebitMinutes(params.gapMinutes);
    setJustReason("");
    setDebitOvertime(false);
    setJustModalOpen(true);
  }

  function openVoluntaryJustification(params: { date: string }) {
    setJustMode("VOLUNTARY");
    setJustDate(params.date);
    setJustFrom("12:00");
    setJustTo("13:30");
    setJustGapType("idle");
    setJustGapMinutes(90);
    setDebitMinutes(90);
    setJustReason("");
    setDebitOvertime(false);
    setJustModalOpen(true);
  }

  async function submitJustification() {
    if (!userId) return;
    if (!justReason.trim()) {
      setError("Informe a justificativa.");
      return;
    }
    try {
      setSaving(true);
      setError("");
      await rendimentoService.createJustification({
        userId,
        date: justDate,
        fromTime: justFrom,
        toTime: justTo,
        gapType: justGapType,
        gapMinutes: justGapMinutes,
        kind: justMode,
        reason: justReason.trim(),
        debitOvertime,
        overtimeMinutes: debitOvertime ? debitMinutes : 0,
      });
      setJustModalOpen(false);
      await loadTimesheet();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível salvar justificativa.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function decideJustification(id: string, decision: "APPROVED" | "REJECTED") {
    try {
      setError("");
      await rendimentoService.decideJustification({ id, decision });
      await loadTimesheet();
    } catch (err) {
      setError(
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

            {error ? (
              <div className="alle-alert-error rounded-xl p-4 text-sm">{error}</div>
            ) : null}

            <RendimentoCalendar
              timesheet={timesheet}
              view={view}
              referenceDate={referenceDate}
              loading={loading}
              canApproveJustification={canApprove}
              onOpenAlertJustification={openAlertJustification}
              onOpenVoluntaryJustification={openVoluntaryJustification}
              onApproveJustification={(id) => void decideJustification(id, "APPROVED")}
              onRejectJustification={(id) => void decideJustification(id, "REJECTED")}
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
                    <Input
                      type="date"
                      value={justDate}
                      onChange={(e) => setJustDate(e.target.value)}
                    />
                    <Input
                      type="time"
                      value={justFrom}
                      onChange={(e) => setJustFrom(e.target.value)}
                    />
                    <Input
                      type="time"
                      value={justTo}
                      onChange={(e) => setJustTo(e.target.value)}
                    />
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={justGapMinutes}
                    onChange={(e) => setJustGapMinutes(Number(e.target.value) || 0)}
                    placeholder="Minutos da lacuna"
                  />
                  <Textarea
                    value={justReason}
                    onChange={(e) => setJustReason(e.target.value)}
                    placeholder="Descreva a justificativa (ex.: consulta médica)."
                    className="min-h-[120px]"
                  />
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <FlipCheckbox
                      checked={debitOvertime}
                      onChange={(e) => setDebitOvertime(e.target.checked)}
                    />
                    Debitar horas extras
                  </label>
                  {debitOvertime ? (
                    <Input
                      type="number"
                      min={1}
                      max={1440}
                      value={debitMinutes}
                      onChange={(e) => setDebitMinutes(Number(e.target.value) || 0)}
                      placeholder="Minutos para debitar de HE"
                    />
                  ) : null}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setJustModalOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button type="button" disabled={saving} onClick={() => void submitJustification()}>
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
