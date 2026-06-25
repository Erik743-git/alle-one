"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Paperclip,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  PROJECT_APPROVAL_LABELS,
  projetosService,
  type ProjectDetail,
} from "@/lib/services/projetos.service";

const ACCEPT_DOCS =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type Props = {
  project: ProjectDetail;
  canEdit: boolean;
  isAdmin: boolean;
  onUpdated: () => void;
};

export function ProjectBudgetDocumentsPanel({
  project,
  canEdit,
  isAdmin,
  onUpdated,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [approving, setApproving] = useState(false);

  const { budget, completionApproval, status } = project;
  const documents = Array.isArray(project.documents) ? project.documents : [];

  async function handleUpload(list: FileList | null) {
    if (!list?.length) return;
    try {
      setUploading(true);
      await projetosService.addProjectDocuments(project.id, Array.from(list));
      onUpdated();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleComplete() {
    try {
      setCompleting(true);
      await projetosService.updateProject(project.id, { status: "COMPLETED" });
      notifySuccess("Projeto concluído.");
      onUpdated();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Não foi possível concluir.");
      onUpdated();
    } finally {
      setCompleting(false);
    }
  }

  async function handleApprove() {
    try {
      setApproving(true);
      await projetosService.approveProjectCompletion(project.id);
      notifySuccess("Conclusão aprovada.");
      onUpdated();
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Orçamento de tempo</h3>
        </div>

        {budget.amount != null && budget.unit ? (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Previsto</p>
                <p className="text-lg font-semibold">
                  {budget.amount} {budget.unitLabel}
                </p>
              </div>
              <div
                className={cn(
                  "rounded-lg p-3",
                  budget.exceeded ? "bg-rose-500/10" : "bg-emerald-500/10",
                )}
              >
                <p className="text-xs text-muted-foreground">Consumido</p>
                <p
                  className={cn(
                    "text-lg font-semibold",
                    budget.exceeded ? "text-rose-400" : "text-emerald-400",
                  )}
                >
                  {budget.consumedInUnit ?? 0} {budget.unitLabel}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Equivalente: {budget.consumedDays} dias · {budget.consumedHours} horas
              (jornada de 8h/dia)
            </p>
            {budget.exceeded ? (
              <p className="flex items-start gap-2 text-sm text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Orçamento excedido. Para concluir o projeto, um administrador precisa
                aprovar.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Sem orçamento definido.</p>
        )}

        {completionApproval.status === "PENDING" ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium text-amber-300">
              Aprovação pendente — {PROJECT_APPROVAL_LABELS.PENDING}
            </p>
            {isAdmin ? (
              <Button
                type="button"
                size="sm"
                className="mt-2"
                disabled={approving}
                onClick={() => void handleApprove()}
              >
                {approving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-2 h-4 w-4" />
                )}
                Aprovar conclusão
              </Button>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Aguardando um administrador liberar a conclusão.
              </p>
            )}
          </div>
        ) : completionApproval.status === "APPROVED" ? (
          <p className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Excesso aprovado
            {completionApproval.approvedByName
              ? ` por ${completionApproval.approvedByName}`
              : ""}
          </p>
        ) : null}

        {canEdit && status !== "COMPLETED" && status !== "CANCELED" ? (
          <Button
            type="button"
            variant="secondary"
            disabled={completing}
            onClick={() => void handleComplete()}
          >
            {completing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Concluir projeto
          </Button>
        ) : null}
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Documentação</h3>
          </div>
          {canEdit ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Paperclip className="mr-2 h-4 w-4" />
                )}
                Anexar
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_DOCS}
                multiple
                className="hidden"
                onChange={(e) => void handleUpload(e.target.files)}
              />
            </>
          ) : null}
        </div>

        {documents.length ? (
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/40"
                  onClick={() =>
                    void projetosService.downloadProjectDocument(
                      project.id,
                      doc.id,
                    )
                  }
                >
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate">{doc.originalName}</span>
                  <span className="text-xs text-muted-foreground">
                    {(doc.size / 1024).toFixed(0)} KB
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum PDF ou Word anexado. Anexe escopo, proposta ou especificação.
          </p>
        )}
      </div>
    </div>
  );
}
