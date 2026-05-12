"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
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
import { getStoredUser } from "@/lib/session";
import { gmudsService, type Gmud } from "@/lib/services/gmuds.service";
import { GmudStatusBadge } from "../_components/gmud-status-badge";
import { GmudForm } from "../_components/gmud-form";
import { Input } from "@/components/ui/input";

function approverStatusLabel(status: "PENDING" | "APPROVED" | "REJECTED") {
  if (status === "APPROVED") return "Aprovou";
  if (status === "REJECTED") return "Rejeitou";
  return "Pendente";
}

export default function GmudDetailPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
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
    (user?.role === "ADMIN" || user?.role === "COLLABORATOR") && gmud?.status === "APPROVED";

  const canCompleteExecution =
    (user?.role === "ADMIN" || user?.role === "COLLABORATOR") && gmud?.status === "IN_EXECUTION";

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
            <DialogContent className="font-sans max-w-[95vw] sm:max-w-xl border border-white/10 bg-[#08182f] text-white">
              <DialogHeader>
                <DialogTitle className="font-sans text-white">Aprovar em nome de</DialogTitle>
                <DialogDescription className="font-sans text-slate-400">
                  A evidência é obrigatória e ficará anexada na GMUD.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="text-sm text-slate-400">Aprovador alvo</div>
                  <select
                    value={onBehalfUserId}
                    onChange={(e) => setOnBehalfUserId(e.target.value)}
                    className="h-11 w-full rounded-md border border-white/15 bg-[#020b1b] px-3 text-sm text-white"
                  >
                    <option value="">Selecione...</option>
                    {(gmud?.approvers ?? [])
                      .filter((a) => a.status === "PENDING")
                      .map((a) => (
                        <option key={a.user.id} value={a.user.id}>
                          {a.user.name} ({a.user.email})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <div className="text-sm text-slate-400">
                    Evidência <span className="text-red-300">*</span>
                  </div>
                  <Input
                    type="file"
                    onChange={(e) => setOnBehalfEvidence(e.target.files?.[0] ?? null)}
                    className="border-white/15 bg-[#020b1b] text-white"
                    disabled={actionLoading}
                  />
                  <div className="text-xs text-slate-500">
                    Obrigatório ao aprovar/rejeitar em nome de outro usuário.
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm text-slate-400">Nota (opcional)</div>
                  <Textarea
                    value={onBehalfNote}
                    onChange={(e) => setOnBehalfNote(e.target.value)}
                    className="min-h-[90px] border-white/15 bg-[#020b1b] text-white placeholder:text-slate-500"
                    placeholder="Opcional: detalhe da decisão"
                    disabled={actionLoading}
                  />
                </div>
              </div>

              <DialogFooter className="gap-2 border-white/10 bg-[#08182f]">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 border-white/15 bg-white/5 text-white hover:bg-white/10"
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
            <DialogContent className="font-sans max-w-[95vw] sm:max-w-md border border-white/10 bg-[#08182f] text-white">
              <DialogHeader>
                <DialogTitle className="font-sans text-white">Confirmar ação</DialogTitle>
                <DialogDescription className="font-sans text-slate-400">
                  {confirmDecision === "APPROVE" ? "Aprovar" : "Rejeitar"} em nome de{" "}
                  <span className="text-slate-200 font-semibold">
                    {targetApprover?.user?.name ?? "—"}
                  </span>
                  ?
                </DialogDescription>
              </DialogHeader>

              <DialogFooter className="gap-2 border-white/10 bg-[#08182f]">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 border-white/15 bg-white/5 text-white hover:bg-white/10"
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
              <h1 className="text-3xl font-bold text-white">GMUD</h1>
              <p className="text-slate-400">Detalhe e ações do fluxo.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/gmud">
                <Button
                  variant="outline"
                  className="h-11 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                >
                  Voltar
                </Button>
              </Link>
              {gmud && (gmud.status === "DRAFT" || gmud.status === "PENDING_APPROVAL") ? (
                <Link href={`/gmud/${gmud.id}?mode=${mode === "edit" ? "view" : "edit"}`}>
                  <Button className="h-11 bg-[#12b5d9] text-white hover:bg-[#0ea5c6]">
                    {mode === "edit" ? "Ver" : "Editar"}
                  </Button>
                </Link>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-xl border border-white/10 bg-[#08182f] p-6 text-sm text-slate-400">
              Carregando GMUD...
            </div>
          ) : gmud ? (
            <div className="space-y-5">
              <Card className="border border-white/10 bg-[#08182f] text-white">
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">
                      #{gmud.code} — {gmud.title}
                    </CardTitle>
                    <div className="text-sm text-slate-400">{gmud.company?.name ?? ""}</div>
                  </div>
                  <GmudStatusBadge status={gmud.status} />
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-slate-400">
                    Criada por <span className="text-white">{gmud.creator?.name ?? "—"}</span> em{" "}
                    <span className="text-white">
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
                          className="border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/15 hover:text-red-100"
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

              <Card className="border border-white/10 bg-[#08182f] text-white">
                <CardHeader>
                  <CardTitle className="text-sm text-slate-400">Aprovação</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(gmud.approvers ?? []).length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-[#020b1b] p-3 text-sm text-slate-400">
                      Nenhum aprovador configurado.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {(gmud.approvers ?? []).map((a) => (
                        <div
                          key={a.user.id}
                          className="rounded-xl border border-white/10 bg-[#020b1b] p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-white">
                                {a.user.name}
                              </div>
                              <div className="truncate text-xs text-slate-400">
                                {a.user.email}
                              </div>
                            </div>
                            <span
                              className={
                                "shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold " +
                                (a.status === "APPROVED"
                                  ? "border-emerald-400/20 bg-emerald-500/15 text-emerald-200"
                                  : a.status === "REJECTED"
                                    ? "border-red-400/20 bg-red-500/10 text-red-200"
                                    : "border-orange-400/20 bg-orange-500/10 text-orange-200")
                              }
                            >
                              {approverStatusLabel(a.status)}
                            </span>
                          </div>
                          {a.decidedAt ? (
                            <div className="mt-2 text-xs text-slate-500">
                              {new Date(a.decidedAt).toLocaleString("pt-BR")}
                              {a.decisionNote ? (
                                <>
                                  {" "}
                                  • <span className="text-slate-300">{a.decisionNote}</span>
                                </>
                              ) : null}
                            </div>
                          ) : (
                            <div className="mt-2 text-xs text-slate-500">
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
                <Card className="border border-white/10 bg-[#08182f] text-white">
                  <CardHeader>
                    <CardTitle className="text-sm text-slate-400">Nota para aprovação</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="min-h-[90px] border-white/15 bg-[#020b1b] text-white placeholder:text-slate-500"
                      placeholder="Opcional: detalhe da decisão"
                    />
                  </CardContent>
                </Card>
              ) : null}

              <Card className="border border-white/10 bg-[#08182f] text-white">
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-sm text-slate-400">Anexos</CardTitle>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      disabled={fileUploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleUpload(f);
                      }}
                      className="text-sm text-slate-300"
                    />
                    {fileUploading ? (
                      <span className="text-xs text-slate-400">Enviando...</span>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(gmud.attachments ?? []).length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-[#020b1b] p-3 text-sm text-slate-400">
                      Nenhum anexo.
                    </div>
                  ) : null}
                  {(gmud.attachments ?? []).map((a) => (
                    <div
                      key={a.id}
                      className="rounded-xl border border-white/10 bg-[#020b1b] p-3"
                    >
                      <div className="text-sm font-semibold">{a.file.originalName}</div>
                      <div className="text-xs text-slate-400">
                        Enviado por {a.uploader.name} •{" "}
                        {new Date(a.createdAt).toLocaleString("pt-BR")}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <GmudForm initial={gmud} mode={mode === "edit" ? "edit" : "view"} />
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-[#08182f] p-6 text-sm text-slate-400">
              GMUD não encontrada.
            </div>
          )}
        </div>
      </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}

