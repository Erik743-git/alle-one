"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/lib/confirm";
import { notifyError, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  classificationService,
  type ClassificationNode,
  type ClassificationTreeResponse,
  type ServiceDeskOption,
} from "@/lib/services/classification.service";

const LEVEL_HINTS: Record<number, string> = {
  1: "Nível 1 — categoria",
  2: "Nível 2 — subcategoria",
  3: "Nível 3 — produto/solução",
};

type AddTarget = {
  parentId?: string;
  level: number;
};

type Props = {
  open: boolean;
  desk: ServiceDeskOption | null;
  onOpenChange: (open: boolean) => void;
  onDeskUpdated: (desk: ServiceDeskOption) => void;
  onDeskDeleted: (deskId: string) => void;
};

export function DeskClassificationModal({
  open,
  desk,
  onOpenChange,
  onDeskUpdated,
  onDeskDeleted,
}: Props) {
  const [treeData, setTreeData] = useState<ClassificationTreeResponse | null>(
    null,
  );
  const [treeLoading, setTreeLoading] = useState(false);
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingNode, setEditingNode] = useState<ClassificationNode | null>(
    null,
  );
  const [editName, setEditName] = useState("");
  const [editingDeskName, setEditingDeskName] = useState(false);
  const [deskNameDraft, setDeskNameDraft] = useState("");
  const confirm = useConfirm();

  const chain = useMemo(() => treeData?.chain ?? [], [treeData]);

  const nextLevel = chain.length + 1;
  const canAddLevel = nextLevel <= 3;

  const loadTree = useCallback(async (deskId: string) => {
    try {
      setTreeLoading(true);
      const data = await classificationService.getTree(deskId);
      setTreeData(data);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Falha ao carregar classificações.",
      );
      setTreeData(null);
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !desk) {
      setTreeData(null);
      setAddTarget(null);
      setNewName("");
      setEditingNode(null);
      setEditingDeskName(false);
      return;
    }
    setDeskNameDraft(desk.name);
    void loadTree(desk.id);
    setAddTarget(null);
    setNewName("");
    setEditingNode(null);
  }, [open, desk, loadTree]);

  if (!desk) return null;

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      setSaving(true);
      await classificationService.create({
        serviceDeskId: desk!.id,
        parentId: addTarget?.parentId,
        name: newName.trim(),
      });
      notifySuccess("Classificação criada.");
      setAddTarget(null);
      setNewName("");
      await loadTree(desk!.id);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Falha ao criar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateNode() {
    if (!editingNode || !editName.trim()) return;
    try {
      setSaving(true);
      await classificationService.update(editingNode.id, {
        name: editName.trim(),
      });
      notifySuccess("Classificação atualizada.");
      setEditingNode(null);
      setEditName("");
      await loadTree(desk!.id);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Falha ao atualizar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteNode(node: ClassificationNode) {
    const ok = await confirm({
      title: "Excluir classificação",
      description: `Excluir "${node.name}"? Os níveis abaixo também serão removidos.`,
      confirmText: "Excluir",
      variant: "error",
    });
    if (!ok) return;

    try {
      await classificationService.remove(node.id);
      notifySuccess("Classificação removida.");
      await loadTree(desk!.id);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Falha ao excluir.");
    }
  }

  async function handleToggleActive(node: ClassificationNode) {
    try {
      await classificationService.update(node.id, { active: !node.active });
      await loadTree(desk!.id);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Falha ao alterar status.",
      );
    }
  }

  async function handleSaveDeskName() {
    if (!deskNameDraft.trim()) return;
    try {
      setSaving(true);
      const updated = await classificationService.updateDesk(
        desk!.id,
        deskNameDraft.trim(),
      );
      notifySuccess("Mesa atualizada.");
      setEditingDeskName(false);
      onDeskUpdated(updated);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Falha ao atualizar mesa.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDesk() {
    const tifluxNote =
      desk!.source === "tiflux"
        ? " Mesas do TiFlux podem voltar ao usar \"Atualizar do TiFlux\"."
        : "";
    const ok = await confirm({
      title: "Excluir mesa",
      description: `Excluir a mesa "${desk!.name}" e todas as classificações vinculadas?${tifluxNote}`,
      confirmText: "Excluir",
      variant: "error",
    });
    if (!ok) return;

    try {
      setSaving(true);
      await classificationService.deleteDesk(desk!.id);
      notifySuccess("Mesa excluída.");
      onDeskDeleted(desk!.id);
      onOpenChange(false);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Falha ao excluir mesa.",
      );
    } finally {
      setSaving(false);
    }
  }

  function openAddNextLevel() {
    const parent = chain[chain.length - 1];
    setAddTarget({
      level: nextLevel,
      parentId: parent?.id,
    });
    setEditingNode(null);
    setNewName("");
  }

  const pathPreview = [
    desk.name,
    ...chain.map((n) => n.name),
    ...Array.from({ length: Math.max(0, 3 - chain.length) }, (_, i) =>
      `Nível ${chain.length + i + 1}`,
    ),
  ].join(" → ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Hierarquia da mesa</DialogTitle>
          <DialogDescription>
            Cada mesa permite apenas 1 item por nível (categoria, subcategoria
            e produto/solução).
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-muted/20 p-4">
            <div className="min-w-0 flex-1 space-y-2">
              {editingDeskName ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[180px] flex-1 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground">
                      Nome da mesa
                    </p>
                    <Input
                      value={deskNameDraft}
                      onChange={(e) => setDeskNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleSaveDeskName();
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={saving || !deskNameDraft.trim()}
                    onClick={() => void handleSaveDeskName()}
                  >
                    Salvar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingDeskName(false);
                      setDeskNameDraft(desk.name);
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold text-foreground">
                    {desk.name}
                  </span>
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-xs font-medium",
                      desk.source === "tiflux"
                        ? "bg-muted text-muted-foreground"
                        : "border border-border text-foreground",
                    )}
                  >
                    {desk.source === "tiflux" ? "TiFlux" : "Portal"}
                  </span>
                  {desk.externalId != null ? (
                    <span className="text-xs text-muted-foreground">
                      ID {desk.externalId}
                    </span>
                  ) : null}
                </div>
              )}
              <p className="text-sm text-muted-foreground">{pathPreview}</p>
            </div>
            {!editingDeskName ? (
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => setEditingDeskName(true)}
                >
                  <Pencil size={14} />
                  Editar mesa
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1 text-destructive hover:text-destructive"
                  disabled={saving}
                  onClick={() => void handleDeleteDesk()}
                >
                  <Trash2 size={14} />
                  Excluir mesa
                </Button>
              </div>
            ) : null}
          </div>

          {canAddLevel && !addTarget && !editingNode ? (
            <Button
              type="button"
              size="sm"
              className="gap-1"
              onClick={openAddNextLevel}
            >
              <Plus size={14} />
              Adicionar {LEVEL_HINTS[nextLevel]?.split("—")[0]?.trim()}
            </Button>
          ) : null}

          {addTarget && !editingNode ? (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div className="min-w-[200px] flex-1 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">
                  {LEVEL_HINTS[addTarget.level]}
                </p>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome da classificação"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleCreate();
                  }}
                />
              </div>
              <Button
                type="button"
                disabled={saving || !newName.trim()}
                onClick={() => void handleCreate()}
              >
                {saving ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  "Salvar"
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAddTarget(null);
                  setNewName("");
                }}
              >
                Cancelar
              </Button>
            </div>
          ) : null}

          {editingNode ? (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/30 p-4">
              <div className="min-w-[200px] flex-1 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">
                  Editar {LEVEL_HINTS[editingNode.level]}
                </p>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleUpdateNode();
                  }}
                />
              </div>
              <Button
                type="button"
                disabled={saving || !editName.trim()}
                onClick={() => void handleUpdateNode()}
              >
                Salvar
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditingNode(null);
                  setEditName("");
                }}
              >
                Cancelar
              </Button>
            </div>
          ) : null}

          {treeLoading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="animate-spin" size={18} />
              Carregando classificações...
            </div>
          ) : chain.length > 0 ? (
            <div className="space-y-2 pb-2">
              {chain.map((node, index) => (
                <div key={node.id} className="flex items-stretch gap-2">
                  {index > 0 ? (
                    <div className="flex w-6 shrink-0 items-center justify-center text-muted-foreground">
                      <ChevronRight size={16} />
                    </div>
                  ) : (
                    <div className="w-6 shrink-0" />
                  )}
                  <div
                    className={cn(
                      "flex min-h-[52px] flex-1 flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2",
                      !node.active && "opacity-60",
                    )}
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {LEVEL_HINTS[node.level]}
                    </span>
                    <ChevronRight
                      size={14}
                      className="text-muted-foreground"
                    />
                    <span className="font-medium text-foreground">
                      {node.name}
                    </span>
                    <div className="ml-auto flex flex-wrap items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => void handleToggleActive(node)}
                      >
                        {node.active ? "Desativar" : "Ativar"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => {
                          setEditingNode(node);
                          setEditName(node.name);
                          setAddTarget(null);
                        }}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-destructive hover:text-destructive"
                        onClick={() => void handleDeleteNode(node)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">
              Nenhuma classificação cadastrada. Adicione o nível 1 para começar
              a montar o caminho.
            </p>
          )}

          {chain.length >= 3 ? (
            <p className="text-xs text-muted-foreground">
              Os 3 níveis já estão preenchidos. Edite ou exclua um nível para
              alterar o caminho.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
