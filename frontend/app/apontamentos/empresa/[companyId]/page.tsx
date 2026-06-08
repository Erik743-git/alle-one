"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Building2, HelpCircle, Loader2 } from "lucide-react";

import AppShell from "@/components/layout/app-shell";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { AdminAnswerQuestionDialog } from "@/components/rendimento/admin-answer-question-dialog";
import {
  CompanyAgendaCalendar,
  type CompanyAgendaCalendarView,
} from "@/components/rendimento/company-agenda-calendar";
import { toDateInputValue } from "@/components/rendimento/rendimento-calendar";
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
import { getStoredUser } from "@/lib/session";
import { isClient } from "@/lib/access-control";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  rendimentoService,
  type RendimentoCompanyAgenda,
  type RendimentoCompanyAppointment,
} from "@/lib/services/rendimento.service";

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}min`;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export default function RendimentoEmpresaPage() {
  const params = useParams<{ companyId: string }>();
  const companyId = params.companyId;
  const authUser = getStoredUser();
  const isClientUser = isClient();
  const isAdmin = authUser?.role === "ADMIN";

  const [view, setView] = useState<CompanyAgendaCalendarView>("month");
  const [referenceDate, setReferenceDate] = useState(() => new Date());
  const [agenda, setAgenda] = useState<RendimentoCompanyAgenda | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasAgendaRef = useRef(false);

  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [questionTarget, setQuestionTarget] =
    useState<RendimentoCompanyAppointment | null>(null);
  const [questionMessage, setQuestionMessage] = useState("");
  const [questionSaving, setQuestionSaving] = useState(false);

  const [answerModalOpen, setAnswerModalOpen] = useState(false);
  const [answerTarget, setAnswerTarget] =
    useState<RendimentoCompanyAppointment | null>(null);
  const [answerNote, setAnswerNote] = useState("");
  const [abonar, setAbonar] = useState(false);
  const [answerSaving, setAnswerSaving] = useState(false);

  const loadAgenda = useCallback(async () => {
    if (!companyId) return;
    try {
      if (!hasAgendaRef.current) setLoading(true);
      else setRefreshing(true);
      const data = await rendimentoService.getCompanyAgenda({
        companyId,
        view,
        date: toDateInputValue(referenceDate),
      });
      setAgenda(
        data
          ? {
              ...data,
              days: Array.isArray(data.days) ? data.days : [],
            }
          : null,
      );
      hasAgendaRef.current = true;
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar a agenda empresarial.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [companyId, referenceDate, view]);

  useEffect(() => {
    void loadAgenda();
  }, [loadAgenda]);

  const openQuestion = (entry: RendimentoCompanyAppointment) => {
    if (entry.question) {
      notifyError("Este apontamento já possui um questionamento.");
      return;
    }
    setQuestionTarget(entry);
    setQuestionMessage("");
    setQuestionModalOpen(true);
  };

  const submitQuestion = async () => {
    if (!companyId || !questionTarget) return;
    const message = questionMessage.trim();
    if (message.length < 10) {
      notifyError(
        "Informe a justificativa do questionamento (mín. 10 caracteres).",
      );
      return;
    }
    try {
      setQuestionSaving(true);
      await rendimentoService.createAppointmentQuestion({
        companyId,
        appointmentSource: questionTarget.source,
        appointmentRef: questionTarget.ref,
        ticketNumber: questionTarget.ticketNumber,
        date: questionTarget.date,
        initTime: questionTarget.initTime ?? undefined,
        endTime: questionTarget.endTime ?? undefined,
        userName: questionTarget.userName ?? undefined,
        description: questionTarget.description ?? undefined,
        message,
      });
      notifySuccess(
        "Questionamento enviado. Os gestores foram notificados por e-mail.",
      );
      setQuestionModalOpen(false);
      await loadAgenda();
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível questionar.",
      );
    } finally {
      setQuestionSaving(false);
    }
  };

  const openAnswer = (entry: RendimentoCompanyAppointment) => {
    setAnswerTarget(entry);
    setAnswerNote("");
    setAbonar(false);
    setAnswerModalOpen(true);
  };

  const submitAnswer = async () => {
    if (!answerTarget?.question?.id) return;
    const note = answerNote.trim();
    if (note.length < 3) {
      notifyError("Informe a resposta ao cliente (mín. 3 caracteres).");
      return;
    }
    try {
      setAnswerSaving(true);
      await rendimentoService.answerAppointmentQuestion({
        id: answerTarget.question.id,
        responseNote: note,
        abonar,
      });
      notifySuccess("Resposta enviada ao cliente.");
      setAnswerModalOpen(false);
      await loadAgenda();
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível responder.",
      );
    } finally {
      setAnswerSaving(false);
    }
  };

  const backHref = isAdmin ? "/apontamentos?view=company" : "/apontamentos";

  return (
    <ProtectedPage>
      <PermissionGate module="RENDIMENTO">
        <AppShell>
          <div className="font-sans w-full space-y-8">
            <div className="space-y-4">
              <Button asChild variant="ghost" size="sm" className="-ml-2">
                <Link href={backHref}>
                  <ArrowLeft className="mr-2 size-4" />
                  Voltar
                </Link>
              </Button>

              <div className="space-y-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Building2 size={24} />
                </div>
                <h1 className="text-3xl font-bold text-foreground">
                  Apontamentos
                </h1>
                <p className="text-muted-foreground">
                  {agenda?.company.name ?? "Empresa"} — visão empresarial.
                  {isClientUser
                    ? " Questione um apontamento por vez informando o motivo. A equipe responde por e-mail."
                    : " Responda questionamentos, abone apontamentos ou edite o ticket no TiFlux."}
                </p>
              </div>
            </div>

            <CompanyAgendaCalendar
              agenda={agenda}
              view={view}
              referenceDate={referenceDate}
              loading={loading}
              refreshing={refreshing}
              isClientUser={isClientUser}
              isAdmin={isAdmin}
              onViewChange={setView}
              onReferenceDateChange={setReferenceDate}
              onQuestion={openQuestion}
              onAnswer={openAnswer}
            />
          </div>

          <Dialog open={questionModalOpen} onOpenChange={setQuestionModalOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Questionar apontamento</DialogTitle>
                <DialogDescription>
                  Você pode questionar este apontamento uma vez. A justificativa
                  é obrigatória e será enviada por e-mail a todos os gestores.
                </DialogDescription>
              </DialogHeader>
              {questionTarget && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <p>
                    <strong>Ticket:</strong> #{questionTarget.ticketNumber}
                  </p>
                  <p>
                    <strong>Atendente:</strong>{" "}
                    {questionTarget.userName ?? "—"}
                  </p>
                  <p>
                    <strong>Horário:</strong>{" "}
                    {questionTarget.initTime ?? "—"} –{" "}
                    {questionTarget.endTime ?? "—"} (
                    {formatMinutes(questionTarget.minutes)})
                  </p>
                  {questionTarget.description ? (
                    <p className="mt-2 text-muted-foreground">
                      {questionTarget.description}
                    </p>
                  ) : null}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="question-message">
                  Justificativa do questionamento{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="question-message"
                  value={questionMessage}
                  onChange={(e) => setQuestionMessage(e.target.value)}
                  placeholder="Explique por que está questionando este apontamento (obrigatório)…"
                  rows={4}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Mínimo de 10 caracteres.
                </p>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setQuestionModalOpen(false)}
                  disabled={questionSaving}
                >
                  Cancelar
                </Button>
                <Button onClick={() => void submitQuestion()} disabled={questionSaving}>
                  {questionSaving ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <HelpCircle className="mr-2 size-4" />
                  )}
                  Enviar questionamento
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AdminAnswerQuestionDialog
            open={answerModalOpen}
            onOpenChange={setAnswerModalOpen}
            target={
              answerTarget?.question
                ? {
                    id: answerTarget.question.id,
                    ticketNumber: answerTarget.ticketNumber,
                    message: answerTarget.question.message,
                    userName: answerTarget.userName,
                    appointmentDate: answerTarget.date,
                    initTime: answerTarget.initTime,
                    endTime: answerTarget.endTime,
                  }
                : null
            }
            responseNote={answerNote}
            onResponseNoteChange={setAnswerNote}
            abonar={abonar}
            onAbonarChange={setAbonar}
            saving={answerSaving}
            onSubmit={() => void submitAnswer()}
          />
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
