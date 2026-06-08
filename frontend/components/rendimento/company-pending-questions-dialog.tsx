"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Loader2, MessageSquare } from "lucide-react";

import { AdminAnswerQuestionDialog } from "@/components/rendimento/admin-answer-question-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notifyError, notifySuccess } from "@/lib/notify";
import { ensureArray } from "@/lib/utils";
import {
  rendimentoService,
  type CompanyQuestionItem,
  type RendimentoCompany,
} from "@/lib/services/rendimento.service";

type Props = {
  company: RendimentoCompany | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAnswered?: () => void;
};

export function CompanyPendingQuestionsDialog({
  company,
  open,
  onOpenChange,
  onAnswered,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<CompanyQuestionItem[]>([]);
  const [answerOpen, setAnswerOpen] = useState(false);
  const [answerTarget, setAnswerTarget] = useState<CompanyQuestionItem | null>(
    null,
  );
  const [responseNote, setResponseNote] = useState("");
  const [abonar, setAbonar] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadQuestions = useCallback(async () => {
    if (!company?.id) return;
    try {
      setLoading(true);
      const data = await rendimentoService.listCompanyQuestions({
        companyId: company.id,
        status: "PENDING",
      });
      setQuestions(ensureArray(data));
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar questionamentos.",
      );
    } finally {
      setLoading(false);
    }
  }, [company?.id]);

  useEffect(() => {
    if (open && company?.id) {
      void loadQuestions();
    }
  }, [open, company?.id, loadQuestions]);

  const openAnswer = (item: CompanyQuestionItem) => {
    setAnswerTarget(item);
    setResponseNote("");
    setAbonar(false);
    setAnswerOpen(true);
  };

  const submitAnswer = async () => {
    if (!answerTarget) return;
    const note = responseNote.trim();
    if (note.length < 3) {
      notifyError("Informe a resposta ao cliente (mín. 3 caracteres).");
      return;
    }
    try {
      setSaving(true);
      await rendimentoService.answerAppointmentQuestion({
        id: answerTarget.id,
        responseNote: note,
        abonar,
      });
      notifySuccess("Resposta enviada ao cliente.");
      setAnswerOpen(false);
      await loadQuestions();
      onAnswered?.();
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível responder.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Questionamentos — {company?.name ?? "Empresa"}
            </DialogTitle>
            <DialogDescription>
              Responda os questionamentos pendentes dos clientes.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex min-h-[160px] items-center justify-center">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : questions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum questionamento pendente.
            </p>
          ) : (
            <ul className="space-y-3">
              {questions.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1 text-sm">
                      <p className="font-semibold text-foreground">
                        Ticket #{item.ticketNumber}
                        <span className="ml-2 font-normal text-muted-foreground">
                          {item.appointmentDate}
                          {item.initTime && item.endTime
                            ? ` · ${item.initTime}–${item.endTime}`
                            : ""}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        {item.userName ?? "—"} · por {item.questionedByName}
                      </p>
                      <p className="rounded-md bg-background/60 p-2 text-foreground/90">
                        {item.message}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => openAnswer(item)}>
                      Responder
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {company ? (
            <div className="flex justify-end border-t border-border pt-4">
              <Button asChild variant="outline" size="sm">
                <Link href={`/apontamentos/empresa/${company.id}`}>
                  <CalendarDays className="mr-2 size-4" />
                  Ver agenda completa
                </Link>
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AdminAnswerQuestionDialog
        open={answerOpen}
        onOpenChange={setAnswerOpen}
        target={
          answerTarget
            ? {
                id: answerTarget.id,
                ticketNumber: answerTarget.ticketNumber,
                message: answerTarget.message,
                userName: answerTarget.userName,
                appointmentDate: answerTarget.appointmentDate,
                initTime: answerTarget.initTime,
                endTime: answerTarget.endTime,
              }
            : null
        }
        responseNote={responseNote}
        onResponseNoteChange={setResponseNote}
        abonar={abonar}
        onAbonarChange={setAbonar}
        saving={saving}
        onSubmit={() => void submitAnswer()}
      />
    </>
  );
}

export function PendingQuestionsBadge({
  count,
  onClick,
}: {
  count: number;
  onClick?: () => void;
}) {
  if (count <= 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
      onClick={onClick}
    >
      <MessageSquare className="mr-1.5 size-3.5" />
      {count} pendente{count !== 1 ? "s" : ""}
    </Button>
  );
}
