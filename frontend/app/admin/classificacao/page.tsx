"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FolderTree,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import AppShell from "@/components/layout/app-shell";
import { DeskClassificationModal } from "@/components/admin/desk-classification-modal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  classificationService,
  type ServiceDeskOption,
} from "@/lib/services/classification.service";

export default function AdminClassificacaoPage() {
  const [desks, setDesks] = useState<ServiceDeskOption[]>([]);
  const [desksLoading, setDesksLoading] = useState(true);
  const [newDeskName, setNewDeskName] = useState("");
  const [creatingDesk, setCreatingDesk] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [activeDesk, setActiveDesk] = useState<ServiceDeskOption | null>(null);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingDesk, setEditingDesk] = useState<ServiceDeskOption | null>(null);
  const [editDeskName, setEditDeskName] = useState("");
  const [savingDesk, setSavingDesk] = useState(false);
  const confirm = useConfirm();

  const loadDesks = useCallback(async () => {
    try {
      setDesksLoading(true);
      const list = await classificationService.listDesks();
      setDesks(list ?? []);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Falha ao carregar mesas.",
      );
      setDesks([]);
    } finally {
      setDesksLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDesks();
  }, [loadDesks]);

  function openDeskModal(desk: ServiceDeskOption) {
    setActiveDesk(desk);
    setModalOpen(true);
  }

  function handleDeskUpdated(updated: ServiceDeskOption) {
    setDesks((prev) =>
      prev.map((d) => (d.id === updated.id ? updated : d)),
    );
    setActiveDesk((prev) => (prev?.id === updated.id ? updated : prev));
  }

  function handleDeskDeleted(deskId: string) {
    setDesks((prev) => prev.filter((d) => d.id !== deskId));
    if (activeDesk?.id === deskId) {
      setActiveDesk(null);
    }
  }

  async function handleCreateDesk() {
    if (!newDeskName.trim()) return;
    try {
      setCreatingDesk(true);
      const desk = await classificationService.createDesk(newDeskName.trim());
      notifySuccess("Mesa cadastrada.");
      setNewDeskName("");
      await loadDesks();
      openDeskModal(desk);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Falha ao cadastrar mesa.",
      );
    } finally {
      setCreatingDesk(false);
    }
  }

  function openEditDialog(desk: ServiceDeskOption) {
    setEditingDesk(desk);
    setEditDeskName(desk.name);
    setEditDialogOpen(true);
  }

  async function handleSaveEditDesk() {
    if (!editingDesk || !editDeskName.trim()) return;
    try {
      setSavingDesk(true);
      const updated = await classificationService.updateDesk(
        editingDesk.id,
        editDeskName.trim(),
      );
      notifySuccess("Mesa atualizada.");
      handleDeskUpdated(updated);
      setEditDialogOpen(false);
      setEditingDesk(null);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Falha ao atualizar mesa.",
      );
    } finally {
      setSavingDesk(false);
    }
  }

  async function handleDeleteDeskFromCard(desk: ServiceDeskOption) {
    const ok = await confirm({
      title: "Excluir mesa",
      description: `Excluir a mesa "${desk.name}" e todas as classificações vinculadas?`,
      confirmText: "Excluir",
      variant: "error",
    });
    if (!ok) return;

    try {
      await classificationService.deleteDesk(desk.id);
      notifySuccess("Mesa excluída.");
      handleDeskDeleted(desk.id);
      if (activeDesk?.id === desk.id) {
        setModalOpen(false);
      }
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Falha ao excluir mesa.",
      );
    }
  }

  return (
    <ProtectedPage>
      <PermissionGate module="ADMIN">
        <AppShell>
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <Link
                  href="/admin"
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
                >
                  <ArrowLeft size={16} />
                  Voltar à administração
                </Link>
                <h1 className="text-3xl font-bold text-foreground">
                  Classificação de mesas
                </h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Clique em uma mesa para cadastrar classificações em até 3
                  níveis (várias opções por nível). Você também pode editar ou
                  excluir mesas na lista.
                </p>
              </div>
            </div>

            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FolderTree size={20} />
                  Mesas de serviço
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-4">
                  <div className="min-w-[220px] flex-1 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground">
                      Nova mesa
                    </p>
                    <Input
                      value={newDeskName}
                      onChange={(e) => setNewDeskName(e.target.value)}
                      placeholder="Nome da mesa"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleCreateDesk();
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    className="gap-1"
                    disabled={creatingDesk || !newDeskName.trim()}
                    onClick={() => void handleCreateDesk()}
                  >
                    {creatingDesk ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <Plus size={16} />
                    )}
                    Cadastrar mesa
                  </Button>
                </div>

                {desksLoading ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2 className="animate-spin" size={16} />
                    Carregando mesas...
                  </div>
                ) : desks.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {desks.map((desk) => (
                      <div
                        key={desk.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openDeskModal(desk)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openDeskModal(desk);
                          }
                        }}
                        className="group flex min-h-[80px] cursor-pointer flex-col gap-2 rounded-xl border border-border bg-muted/20 p-4 text-left transition hover:border-primary/40 hover:bg-muted/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-foreground">
                            {desk.name}
                          </span>
                          <div className="flex shrink-0 gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Editar mesa"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditDialog(desk);
                              }}
                            >
                              <Pencil size={14} />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              title="Excluir mesa"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeleteDeskFromCard(desk);
                              }}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma mesa cadastrada. Cadastre uma nova mesa acima.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <DeskClassificationModal
            open={modalOpen}
            desk={activeDesk}
            onOpenChange={setModalOpen}
            onDeskUpdated={handleDeskUpdated}
            onDeskDeleted={handleDeskDeleted}
          />

          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Editar mesa</DialogTitle>
                <DialogDescription>
                  Altere o nome exibido no portal para esta mesa.
                </DialogDescription>
              </DialogHeader>
              <Input
                value={editDeskName}
                onChange={(e) => setEditDeskName(e.target.value)}
                placeholder="Nome da mesa"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSaveEditDesk();
                }}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={savingDesk || !editDeskName.trim()}
                  onClick={() => void handleSaveEditDesk()}
                >
                  {savingDesk ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    "Salvar"
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
