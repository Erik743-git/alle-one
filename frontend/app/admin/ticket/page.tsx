"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Lock, Pencil, Plus, Trash2 } from "lucide-react";

import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import AppShell from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConfirm } from "@/lib/confirm";
import { notifyError, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { adminService, type TicketStage } from "@/lib/services/admin.service";

function StageBadges({ stage }: { stage: TicketStage }) {
  if (!stage.isSystem && stage.active) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {stage.isSystem ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          <Lock className="h-3 w-3" />
          Padrão
        </span>
      ) : null}
      {!stage.active ? (
        <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          Inativo
        </span>
      ) : null}
    </div>
  );
}

export default function AdminTicketPage() {
  const confirm = useConfirm();
  const [stages, setStages] = useState<TicketStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TicketStage | null>(null);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminService.listTicketStages();
      setStages(Array.isArray(data) ? data : []);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível carregar os estágios.",
      );
      setStages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setName("");
    setModalOpen(true);
  }

  function openEdit(stage: TicketStage) {
    setEditing(stage);
    setName(stage.name);
    setModalOpen(true);
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      notifyError("Informe o nome do estágio.");
      return;
    }
    try {
      setSaving(true);
      if (editing) {
        await adminService.updateTicketStage(editing.id, {
          name: trimmed,
        });
        notifySuccess("Estágio atualizado.");
      } else {
        await adminService.createTicketStage({ name: trimmed });
        notifySuccess("Estágio criado.");
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Falha ao salvar o estágio.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(stage: TicketStage) {
    const ok = await confirm({
      title: "Remover estágio",
      description: `Remover o estágio "${stage.name}"?`,
      confirmText: "Remover",
      variant: "error",
    });
    if (!ok) return;
    try {
      setDeletingId(stage.id);
      await adminService.deleteTicketStage(stage.id);
      notifySuccess("Estágio removido.");
      await load();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Falha ao remover o estágio.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <ProtectedPage>
      <PermissionGate module="ADMIN">
        <AppShell>
          <div className="font-sans w-full space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-2">
                <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
                  <Link href="/admin">
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Administração
                  </Link>
                </Button>
                <h1 className="text-3xl font-bold text-foreground">Ticket</h1>
                <p className="text-muted-foreground">
                  Parametrize os estágios de ticket. Os estágios padrão são fixos.
                </p>
              </div>

              <Button onClick={openCreate} className="shrink-0">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar estágio
              </Button>
            </div>

            {loading ? (
              <div className="flex min-h-[30vh] items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                Carregando estágios…
              </div>
            ) : (
              <Card>
                <CardContent className="divide-y divide-border p-0">
                  {stages.map((stage) => (
                    <div
                      key={stage.id}
                      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1.5">
                        <p
                          className={cn(
                            "font-medium",
                            !stage.active && "text-muted-foreground",
                          )}
                        >
                          {stage.name}
                        </p>
                        <StageBadges stage={stage} />
                      </div>

                      <div className="flex shrink-0 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={stage.isSystem}
                          onClick={() => openEdit(stage)}
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={stage.isSystem || deletingId === stage.id}
                          onClick={() => void handleDelete(stage)}
                        >
                          {deletingId === stage.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 mr-1" />
                          )}
                          Remover
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          <Dialog open={modalOpen} onOpenChange={setModalOpen}>
            <DialogContent className="w-[min(96vw,520px)] max-w-[520px]">
              <DialogHeader>
                <DialogTitle>
                  {editing ? "Editar estágio" : "Adicionar estágio"}
                </DialogTitle>
                <DialogDescription>
                  Defina o nome do estágio usado nos tickets.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="stage-name">Nome do estágio *</Label>
                  <Input
                    id="stage-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={120}
                    placeholder="Ex.: Aguardando fornecedor"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando…
                    </>
                  ) : editing ? (
                    "Salvar"
                  ) : (
                    "Adicionar"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
