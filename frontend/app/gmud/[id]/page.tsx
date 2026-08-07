"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/layout/app-shell";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useConfirm } from "@/lib/confirm";
import { getStoredUser } from "@/lib/session";
import { gmudsService, type Gmud } from "@/lib/services/gmuds.service";
import { GmudStatusBadge } from "../_components/gmud-status-badge";
import { GmudForm } from "../_components/gmud-form";
import {
  canEditGmud,
  GMUD_REAPPROVAL_WARNING,
  gmudRequiresReapproval,
} from "../_components/gmud-edit-rules";
import { Input } from "@/components/ui/input";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { triggerBrowserDownload } from "@/lib/download-blob";
import { FileDown } from "lucide-react";
import { parseGmudDecisionNote } from "../_components/gmud-decision-note";

function ApproverDecisionDetails({
  gmudId,
  decidedAt,
  decisionNote,
  attachments,
  onDownloadError,
}: {
  gmudId: string;
  decidedAt: string;
  decisionNote: string | null;
  attachments: Gmud["attachments"];
  onDownloadError: (message: string) => void;
}) {
  const parsed = parseGmudDecisionNote(decisionNote);
  const evidenceAttachment =
    attachments.find((a) => a.file.id === parsed.evidenceFileId) ?? null;

  async function downloadEvidence() {
    if (!evidenceAttachment) {
      onDownloadError("Evidência não encontrada nos anexos desta GMUD.");
      return;
    }
    try {
      const { blob, filename } = await gmudsService.downloadAttachment(
        gmudId,
        evidenceAttachment.id,
        evidenceAttachment.file.originalName,
      );
      triggerBrowserDownload(blob, filename);
    } catch (e) {
      onDownloadError(e instanceof Error ? e.message : "Falha ao baixar evidência");
    }
  }

  return (
    <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
      <div>{new Date(decidedAt).toLocaleString("pt-BR")}</div>
      {parsed.onBehalfOfName || parsed.actedByEmail ? (
        <div className="space-y-0.5 text-foreground">
          {parsed.onBehalfOfName ? (
            <div>
              Em nome de{" "}
              <span className="font-medium">{parsed.onBehalfOfName}</span>
              {parsed.onBehalfOfEmail ? (
                <span className="text-muted-foreground">
                  {" "}
                  ({parsed.onBehalfOfEmail})
                </span>
              ) : null}
            </div>
          ) : null}
          {parsed.actedByEmail ? (
            <div>
              Registrado por{" "}
              <span className="font-medium">{parsed.actedByEmail}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {parsed.freeNote ? (
        <div className="text-foreground">{parsed.freeNote}</div>
      ) : null}
      {!parsed.onBehalfOfName &&
      !parsed.actedByEmail &&
      !parsed.freeNote &&
      decisionNote ? (
        <div className="text-foreground">{decisionNote}</div>
      ) : null}
      {parsed.evidenceFileId ? (
        <div>
          {evidenceAttachment ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-1 h-8"
              onClick={() => void downloadEvidence()}
            >
              <FileDown className="mr-1.5 h-3.5 w-3.5" />
              Baixar evidência
            </Button>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">
              Evidência referenciada, mas o arquivo não está na lista de anexos.
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

function approverStatusLabel(status: "PENDING" | "APPROVED" | "REJECTED") {
  if (status === "APPROVED") return "Aprovou";
  if (status === "REJECTED") return "Rejeitou";
  return "Pendente";
}

export default function GmudDetailPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const confirm = useConfirm();
  const modeParam = search.get("mode");
  const mode: "view" | "edit" = modeParam === "edit" ? "edit" : "view";

  const user = getStoredUser();
  const [gmud, setGmud] = useState<Gmud | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [onBehalfOpen, setOnBehalfOpen] = useState(false);
  const [onBehalfUserId, setOnBehalfUserId] = useState<string>("");
  const [onBehalfEvidence, setOnBehalfEvidence] = useState<File | null>(null);
  const [onBehalfNote, setOnBehalfNote] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmDecision, setConfirmDecision] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [pdfExporting, setPdfExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const data = await gmudsService.getById(params.id);
        if (!cancelled) setGmud(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar GMUD");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const myApproval = useMemo(() => {
    if (!gmud || !user) return null;
    const approvers = Array.isArray(gmud.approvers) ? gmud.approvers : [];
    return approvers.find((a) => a.user?.id === user.id) ?? null;
  }, [gmud, user]);

  const canApprove =
    gmud?.status === "PENDING_APPROVAL" && myApproval?.status === "PENDING";

  const canApproveOnBehalf =
    user?.role === "ADMIN" && gmud?.status === "PENDING_APPROVAL";

  const canStartExecution =
    (user?.role === "ADMIN" ||
      user?.role === "COLLABORATOR" ||
      user?.role === "PJ") &&
    gmud?.status === "APPROVED";

  const canCompleteExecution =
    (user?.role === "ADMIN" ||
      user?.role === "COLLABORATOR" ||
      user?.role === "PJ") &&
    gmud?.status === "IN_EXECUTION";

  async function runAction(fn: () => Promise<Gmud>) {
    setActionLoading(true);
    setError(null);
    try {
      const updated = await fn();
      setGmud(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao executar ação");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleApproveOnBehalf(decision: "APPROVE" | "REJECT") {
    if (!gmud) return;
    if (!onBehalfUserId) {
      setError("Selecione o aprovador para aprovar em nome.");
      return;
    }
    if (!onBehalfEvidence) {
      setError("Envie a evidência (obrigatória).");
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      const updated = await gmudsService.approveOnBehalf({
        id: gmud.id,
        onBehalfOfUserId: onBehalfUserId,
        decision,
        note: onBehalfNote.trim() || undefined,
        evidence: onBehalfEvidence,
      });
      setGmud(updated);
      setOnBehalfOpen(false);
      setOnBehalfEvidence(null);
      setOnBehalfNote("");
      setOnBehalfUserId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao aprovar em nome");
    } finally {
      setActionLoading(false);
    }
  }

  const targetApprover = useMemo(() => {
    if (!gmud || !onBehalfUserId) return null;
    const approvers = Array.isArray(gmud.approvers) ? gmud.approvers : [];
    return approvers.find((a) => a.user?.id === onBehalfUserId) ?? null;
  }, [gmud, onBehalfUserId]);

  async function handleUpload(file: File) {
    if (!gmud) return;
    setFileUploading(true);
    setError(null);
    try {
      await gmudsService.addAttachment(gmud.id, file);
      const refreshed = await gmudsService.getById(gmud.id);
      setGmud(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao enviar anexo");
    } finally {
      setFileUploading(false);
    }
  }

  return (
    <ProtectedPage>
      <PermissionGate module="GMUD">
      <AppShell>
        <div className="font-sans w-full space-y-5">
          <Dialog open={onBehalfOpen} onOpenChange={setOnBehalfOpen}>
            <DialogContent className="font-sans max-w-[95vw] sm:max-w-xl border-border bg-card text-card-foreground">
              <DialogHeader>
                <DialogTitle className="font-sans text-foreground">Aprovar em nome de</DialogTitle>
                <DialogDescription className="font-sans text-muted-foreground">
                  A evidência é obrigatória e ficará anexada na GMUD.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Aprovador alvo</div>
                  <SearchableSelectField
                    value={onBehalfUserId}
                    onChange={setOnBehalfUserId}
                    options={(gmud?.approvers ?? [])
                      .filter((a) => a.status === "PENDING")
                      .map((a) => ({
                        value: a.user.id,
                        label: `${a.user.name} (${a.user.email})`,
                      }))}
                    emptyLabel="Selecione..."
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">
                    Evidência <span className="text-destructive">*</span>
                  </div>
                  <Input
                    type="file"
                    onChange={(e) => setOnBehalfEvidence(e.target.files?.[0] ?? null)}
                    disabled={actionLoading}
                  />
                  <div className="text-xs text-muted-foreground">
                    Obrigatório ao aprovar/rejeitar em nome de outro usuário.
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Nota (opcional)</div>
                  <Textarea
                    value={onBehalfNote}
                    onChange={(e) => setOnBehalfNote(e.target.value)}
                    className="min-h-[90px]"
                    placeholder="Opcional: detalhe da decisão"
                    disabled={actionLoading}
                  />
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => setOnBehalfOpen(false)}
                  disabled={actionLoading}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="h-11 bg-orange-600 text-white hover:bg-orange-700"
                  onClick={() => {
                    setConfirmDecision("REJECT");
                    setConfirmOpen(true);
                  }}
                  disabled={actionLoading}
                >
                  Rejeitar em nome
                </Button>
                <Button
                  type="button"
                  className="h-11 bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => {
                    setConfirmDecision("APPROVE");
                    setConfirmOpen(true);
                  }}
                  disabled={actionLoading}
                >
                  Aprovar em nome
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={confirmOpen}
            onOpenChange={(open) => {
              if (actionLoading) return;
              setConfirmOpen(open);
            }}
          >
            <DialogContent className="font-sans max-w-[95vw] sm:max-w-md border-border bg-card text-card-foreground">
              <DialogHeader>
                <DialogTitle className="font-sans text-foreground">Confirmar ação</DialogTitle>
                <DialogDescription className="font-sans text-muted-foreground">
                  {confirmDecision === "APPROVE" ? "Aprovar" : "Rejeitar"} em nome de{" "}
                  <span className="font-semibold text-foreground">
                    {targetApprover?.user?.name ?? "—"}
                  </span>
                  ?
                </DialogDescription>
              </DialogHeader>

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => setConfirmOpen(false)}
                  disabled={actionLoading}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className={
                    "h-11 text-white " +
                    (confirmDecision === "APPROVE"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-orange-600 hover:bg-orange-700")
                  }
                  onClick={() => void handleApproveOnBehalf(confirmDecision)}
                  disabled={actionLoading}
                >
                  Confirmar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-foreground">GMUD</h1>
              <p className="text-muted-foreground">Detalhe e ações do fluxo.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/gmud">
                <Button variant="outline" className="h-11">
                  Voltar
                </Button>
              </Link>
              {gmud ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  disabled={pdfExporting}
                  onClick={async () => {
                    setPdfExporting(true);
                    setError(null);
                    try {
                      const { blob, filename } = await gmudsService.exportPdf(gmud.id);
                      triggerBrowserDownload(blob, filename);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Falha ao exportar PDF");
                    } finally {
                      setPdfExporting(false);
                    }
                  }}
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  {pdfExporting ? "Gerando PDF..." : "Exportar PDF"}
                </Button>
              ) : null}
              {gmud && canEditGmud(gmud.status) ? (
                mode === "edit" ? (
                  <Link href={`/gmud/${gmud.id}`}>
                    <Button className="h-11">Ver</Button>
                  </Link>
                ) : (
                  <Button
                    type="button"
                    className="h-11"
                    onClick={() => {
                      void (async () => {
                        if (gmudRequiresReapproval(gmud.status)) {
                          const ok = await confirm({
                            title: "Editar GMUD aprovada",
                            description: GMUD_REAPPROVAL_WARNING,
                            confirmText: "Continuar edição",
                            cancelText: "Cancelar",
                            variant: "warning",
                          });
                          if (!ok) return;
                        }
                        router.push(`/gmud/${gmud.id}?mode=edit`);
                      })();
                    }}
                  >
                    Editar
                  </Button>
                )
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Carregando GMUD...
            </div>
          ) : gmud ? (
            <div className="space-y-5">
              <Card className="border border-border bg-card text-card-foreground">
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">
                      #{gmud.code} — {gmud.title}
                    </CardTitle>
                    <div className="text-sm text-muted-foreground">{gmud.company?.name ?? ""}</div>
                  </div>
                  <GmudStatusBadge status={gmud.status} />
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-muted-foreground">
                    Criada por <span className="text-foreground">{gmud.creator?.name ?? "—"}</span> em{" "}
                    <span className="text-foreground">
                      {new Date(gmud.createdAt).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canApprove ? (
                      <>
                        <Button
                          disabled={actionLoading}
                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                          onClick={() =>
                            runAction(() => gmudsService.approve(gmud.id, { decision: "APPROVE", note }))
                          }
                        >
                          Aprovar
                        </Button>
                        <Button
                          disabled={actionLoading}
                          variant="outline"
                          className="alle-btn-outline-danger"
                          onClick={() =>
                            runAction(() => gmudsService.approve(gmud.id, { decision: "REJECT", note }))
                          }
                        >
                          Rejeitar
                        </Button>
                      </>
                    ) : null}

                    {canApproveOnBehalf ? (
                      <Button
                        disabled={actionLoading}
                        className="bg-orange-600 text-white hover:bg-orange-700"
                        onClick={() => setOnBehalfOpen(true)}
                      >
                        Aprovar em nome
                      </Button>
                    ) : null}

                    {canStartExecution ? (
                      <Button
                        disabled={actionLoading}
                        className="bg-blue-600 text-white hover:bg-blue-700"
                        onClick={() => runAction(() => gmudsService.startExecution(gmud.id))}
                      >
                        Iniciar execução
                      </Button>
                    ) : null}

                    {canCompleteExecution ? (
                      <Button
                        disabled={actionLoading}
                        className="bg-teal-600 text-white hover:bg-teal-700"
                        onClick={() => runAction(() => gmudsService.completeExecution(gmud.id))}
                      >
                        Concluir execução
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border bg-card text-card-foreground">
                <CardHeader>
                  <CardTitle className="text-sm text-muted-foreground">Aprovação</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(gmud.approvers ?? []).length === 0 ? (
                    <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                      Nenhum aprovador configurado.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {(gmud.approvers ?? []).map((a) => (
                        <div
                          key={a.user.id}
                          className="rounded-xl border border-border bg-muted/40 p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-foreground">
                                {a.user.name}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {a.user.email}
                              </div>
                            </div>
                            <span
                              className={
                                "shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold " +
                                (a.status === "APPROVED"
                                  ? "alle-badge-success"
                                  : a.status === "REJECTED"
                                    ? "alle-badge-danger"
                                    : "alle-badge-warning")
                              }
                            >
                              {approverStatusLabel(a.status)}
                            </span>
                          </div>
                          {a.decidedAt ? (
                            <ApproverDecisionDetails
                              gmudId={gmud.id}
                              decidedAt={a.decidedAt}
                              decisionNote={a.decisionNote}
                              attachments={gmud.attachments ?? []}
                              onDownloadError={setError}
                            />
                          ) : (
                            <div className="mt-2 text-xs text-muted-foreground">
                              {gmud.status === "PENDING_APPROVAL" ? "Aguardando decisão" : "Sem decisão"}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {canApprove ? (
                <Card className="border border-border bg-card text-card-foreground">
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Nota para aprovação</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="min-h-[90px]"
                      placeholder="Opcional: detalhe da decisão"
                    />
                  </CardContent>
                </Card>
              ) : null}

              <Card className="border border-border bg-card text-card-foreground">
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-sm text-muted-foreground">Anexos</CardTitle>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      disabled={fileUploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleUpload(f);
                      }}
                      className="text-sm text-foreground"
                    />
                    {fileUploading ? (
                      <span className="text-xs text-muted-foreground">Enviando...</span>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(gmud.attachments ?? []).length === 0 ? (
                    <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                      Nenhum anexo.
                    </div>
                  ) : null}
                  {(gmud.attachments ?? []).map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {a.file.originalName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Enviado por {a.uploader.name} •{" "}
                          {new Date(a.createdAt).toLocaleString("pt-BR")}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => {
                          void (async () => {
                            try {
                              const { blob, filename } =
                                await gmudsService.downloadAttachment(
                                  gmud.id,
                                  a.id,
                                  a.file.originalName,
                                );
                              triggerBrowserDownload(blob, filename);
                            } catch (e) {
                              setError(
                                e instanceof Error
                                  ? e.message
                                  : "Falha ao baixar anexo",
                              );
                            }
                          })();
                        }}
                      >
                        <FileDown className="mr-1.5 h-3.5 w-3.5" />
                        Baixar
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <GmudForm initial={gmud} mode={mode === "edit" ? "edit" : "view"} />
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              GMUD não encontrada.
            </div>
          )}
        </div>
      </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}

