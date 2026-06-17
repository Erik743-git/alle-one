"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HelpCircle, Loader2 } from "lucide-react";

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
import { notifyError, notifySuccess } from "@/lib/notify";
import { isValidCompanyUuid } from "@/lib/selected-company";
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

type CompanyAgendaPanelProps = {
  companyId: string;
  isClientUser?: boolean;
  isAdmin?: boolean;
  onAgendaLoaded?: (agenda: RendimentoCompanyAgenda | null) => void;
};

export function CompanyAgendaPanel({
  companyId,
  isClientUser = false,
  isAdmin = false,
  onAgendaLoaded,
}: CompanyAgendaPanelProps) {
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
    if (!isValidCompanyUuid(companyId)) return;
    try {
      if (!hasAgendaRef.current) setLoading(true);
      else setRefreshing(true);
      const data = await rendimentoService.getCompanyAgenda({
        companyId,
        view,
        date: toDateInputValue(referenceDate),
      });
      const normalized = data
        ? { ...data, days: Array.isArray(data.days) ? data.days : [] }
        : null;
      setAgenda(normalized);
      onAgendaLoaded?.(normalized);
      hasAgendaRef.current = true;
    } catch (err) {
      setAgenda(null);
      onAgendaLoaded?.(null);
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar a agenda da empresa.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [companyId, onAgendaLoaded, referenceDate, view]);

  useEffect(() => {
    hasAgendaRef.current = false;
    setAgenda(null);
    onAgendaLoaded?.(null);
  }, [companyId, onAgendaLoaded]);

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

  if (!companyId) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Selecione uma empresa para ver os apontamentos.
      </p>
    );
  }

  return (
    <>
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
        onQuestion={isClientUser ? openQuestion : undefined}
        onAnswer={isAdmin ? openAnswer : undefined}
      />

      <Dialog open={questionModalOpen} onOpenChange={setQuestionModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Questionar apontamento</DialogTitle>
            <DialogDescription>
              Você pode questionar este apontamento uma vez. A justificativa é
              obrigatória e será enviada por e-mail a todos os gestores.
            </DialogDescription>
          </DialogHeader>
          {questionTarget && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <p>
                <strong>Ticket:</strong> #{questionTarget.ticketNumber}
              </p>
              <p>
                <strong>Atendente:</strong> {questionTarget.userName ?? "—"}
              </p>
              <p>
                <strong>Horário:</strong> {questionTarget.initTime ?? "—"} –{" "}
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
            <Label htmlFor="financeiro-question-message">
              Justificativa do questionamento{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="financeiro-question-message"
              value={questionMessage}
              onChange={(e) => setQuestionMessage(e.target.value)}
              placeholder="Explique por que está questionando este apontamento (obrigatório)…"
              rows={4}
              required
            />
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
    </>
  );
}
