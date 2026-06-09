"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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

function ClassificationTreeRows({
  nodes,
  depth,
  onAddChild,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  nodes: ClassificationNode[];
  depth: number;
  onAddChild: (node: ClassificationNode) => void;
  onEdit: (node: ClassificationNode) => void;
  onDelete: (node: ClassificationNode) => void;
  onToggleActive: (node: ClassificationNode) => void;
}) {
  return (
    <div className={cn("space-y-2", depth > 0 && "ml-5 border-l border-border pl-3")}>
      {nodes.map((node) => (
        <div key={node.id} className="space-y-2">
          <div
            className={cn(
              "flex min-h-[52px] flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2",
              !node.active && "opacity-60",
            )}
          >
            {depth > 0 ? (
              <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
            ) : null}
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {LEVEL_HINTS[node.level]}
            </span>
            <span className="font-medium text-foreground">{node.name}</span>
            <div className="ml-auto flex flex-wrap items-center gap-1">
              {node.level < 3 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => onAddChild(node)}
                >
                  <Plus size={14} />
                  Filho
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => onToggleActive(node)}
              >
                {node.active ? "Desativar" : "Ativar"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => onEdit(node)}
              >
                <Pencil size={14} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-destructive hover:text-destructive"
                onClick={() => onDelete(node)}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </div>

          {node.children.length > 0 ? (
            <ClassificationTreeRows
              nodes={node.children}
              depth={depth + 1}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleActive={onToggleActive}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

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

  const tree = treeData?.tree ?? [];

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
      description: `Excluir "${node.name}"? Itens filhos também serão removidos.`,
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

  function openAddRoot() {
    setAddTarget({ level: 1 });
    setEditingNode(null);
    setNewName("");
  }

  function openAddChild(node: ClassificationNode) {
    if (node.level >= 3) return;
    setAddTarget({ level: node.level + 1, parentId: node.id });
    setEditingNode(null);
    setNewName("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Hierarquia da mesa</DialogTitle>
          <DialogDescription>
            Cadastre quantas classificações precisar em cada nível (até 3
            níveis de profundidade).
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
                </div>
              )}
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

          {!addTarget && !editingNode ? (
            <Button
              type="button"
              size="sm"
              className="gap-1"
              onClick={openAddRoot}
            >
              <Plus size={14} />
              Adicionar categoria (nível 1)
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
          ) : tree.length > 0 ? (
            <ClassificationTreeRows
              nodes={tree}
              depth={0}
              onAddChild={openAddChild}
              onEdit={(node) => {
                setEditingNode(node);
                setEditName(node.name);
                setAddTarget(null);
              }}
              onDelete={(node) => void handleDeleteNode(node)}
              onToggleActive={(node) => void handleToggleActive(node)}
            />
          ) : (
            <p className="py-4 text-sm text-muted-foreground">
              Nenhuma classificação cadastrada. Adicione categorias de nível 1
              para começar.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
