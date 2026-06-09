"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import AppShell from "@/components/layout/app-shell";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { InventoryAssetModal } from "@/components/inventario/inventory-asset-modal";
import { InventoryAttachmentPreviewDialog } from "@/components/inventario/inventory-attachment-preview-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  canDeleteInventario,
  canEditInventario,
  isClient,
} from "@/lib/access-control";
import { useConfirm } from "@/lib/confirm";
import { notifyError, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  inventarioService,
  type InventoryAsset,
  type InventoryAssetFile,
} from "@/lib/services/inventario.service";

function formatDueDate(value: string | null) {
  if (!value) return "Sem vencimento";
  const d = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR");
}

function formatReminder(days: number | null) {
  if (days == null) return "—";
  return `${days} dias antes`;
}

function isOverdue(value: string | null) {
  if (!value) return false;
  const due = new Date(`${value.slice(0, 10)}T12:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

export default function InventarioEmpresaPage() {
  const params = useParams<{ companyId: string }>();
  const companyId = params.companyId;
  const clientUser = isClient();
  const confirm = useConfirm();

  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editing, setEditing] = useState<InventoryAsset | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<InventoryAssetFile | null>(null);

  const canEdit = canEditInventario();
  const canDelete = canDeleteInventario();

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      setLoading(true);
      const data = await inventarioService.listAssets(companyId);
      setCompanyName(data.company.name);
      setAssets(data.assets);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível carregar o inventário.",
      );
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedAssets = useMemo(() => assets, [assets]);

  function openCreate() {
    setModalMode("create");
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(asset: InventoryAsset) {
    setModalMode("edit");
    setEditing(asset);
    setModalOpen(true);
  }

  function openAttachment(file: InventoryAssetFile) {
    setPreviewFile(file);
    setPreviewOpen(true);
  }

  async function handleSave(payload: {
    assetTypeId: string;
    description: string;
    dueDate: string;
    reminderDaysBefore: string;
    file: File | null;
    removeAttachment: boolean;
    clearDueDate: boolean;
    clearReminder: boolean;
  }) {
    if (!companyId) return;
    try {
      setSaving(true);
      if (modalMode === "create") {
        await inventarioService.createAsset(
          companyId,
          {
            assetTypeId: payload.assetTypeId,
            description: payload.description || undefined,
            dueDate: payload.dueDate || undefined,
            reminderDaysBefore: payload.reminderDaysBefore || undefined,
          },
          payload.file,
        );
        notifySuccess("Ativo adicionado ao inventário.");
      } else if (editing) {
        await inventarioService.updateAsset(
          editing.id,
          {
            assetTypeId: payload.assetTypeId,
            description: payload.description,
            dueDate: payload.dueDate,
            reminderDaysBefore: payload.reminderDaysBefore,
            clearDueDate: payload.clearDueDate,
            clearReminder: payload.clearReminder,
            removeAttachment: payload.removeAttachment,
          },
          payload.file,
        );
        notifySuccess("Ativo atualizado.");
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Falha ao salvar o ativo.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(asset: InventoryAsset) {
    const label = asset.assetTypeName || asset.name;
    const ok = await confirm({
      title: "Excluir ativo",
      description: `Excluir o ativo "${label}"?`,
      confirmText: "Excluir",
      variant: "error",
    });
    if (!ok) return;
    try {
      setDeletingId(asset.id);
      await inventarioService.deleteAsset(asset.id);
      notifySuccess("Ativo removido.");
      await load();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Falha ao excluir o ativo.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <ProtectedPage>
      <PermissionGate module="INVENTARIO">
        <AppShell>
          <div className="font-sans w-full space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2 min-w-0">
                {!clientUser ? (
                  <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
                    <Link href="/inventario">
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Empresas
                    </Link>
                  </Button>
                ) : null}
                <h1 className="text-2xl font-semibold tracking-tight truncate">
                  {companyName || "Inventário"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {sortedAssets.length}{" "}
                  {sortedAssets.length === 1 ? "ativo cadastrado" : "ativos cadastrados"}
                </p>
              </div>
              {canEdit ? (
                <Button onClick={openCreate} className="shrink-0">
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar ativo
                </Button>
              ) : null}
            </div>

            {loading ? (
              <div className="flex min-h-[30vh] items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                Carregando ativos…
              </div>
            ) : sortedAssets.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum ativo neste inventário.
                  {canEdit ? (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="text-primary underline-offset-2 hover:underline"
                        onClick={openCreate}
                      >
                        Adicionar o primeiro
                      </button>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            ) : (
              <Accordion type="multiple" className="rounded-lg border bg-card px-4">
                {sortedAssets.map((asset) => {
                  const overdue = isOverdue(asset.dueDate);
                  const title = asset.assetTypeName || asset.name;
                  return (
                    <AccordionItem key={asset.id} value={asset.id}>
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex flex-1 min-w-0 items-center justify-between gap-3 pr-2">
                          <span className="font-medium truncate">{title}</span>
                          <span
                            className={cn(
                              "shrink-0 text-sm tabular-nums",
                              overdue
                                ? "text-destructive font-medium"
                                : "text-muted-foreground",
                            )}
                          >
                            {formatDueDate(asset.dueDate)}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <dl className="grid gap-3 text-sm sm:grid-cols-2 pb-2">
                          <div>
                            <dt className="text-muted-foreground">Tipo</dt>
                            <dd>{asset.assetTypeName || "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Lembrete</dt>
                            <dd>{formatReminder(asset.reminderDaysBefore)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Vencimento</dt>
                            <dd className={overdue ? "text-destructive" : undefined}>
                              {formatDueDate(asset.dueDate)}
                            </dd>
                          </div>
                          <div className="sm:col-span-2">
                            <dt className="text-muted-foreground">Descrição</dt>
                            <dd className="whitespace-pre-wrap">
                              {asset.description?.trim() || "—"}
                            </dd>
                          </div>
                          <div className="sm:col-span-2">
                            <dt className="text-muted-foreground mb-1">Anexo</dt>
                            <dd>
                              {asset.file ? (
                                <Button
                                  type="button"
                                  variant="link"
                                  className="h-auto p-0 text-primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openAttachment(asset.file!);
                                  }}
                                >
                                  <FileText className="h-4 w-4 mr-1 inline" />
                                  {asset.file.originalName}
                                </Button>
                              ) : (
                                "—"
                              )}
                            </dd>
                          </div>
                        </dl>

                        {(canEdit || canDelete) && (
                          <div className="flex flex-wrap gap-2 pt-2 border-t mt-2">
                            {canEdit ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEdit(asset)}
                              >
                                <Pencil className="h-4 w-4 mr-1" />
                                Editar
                              </Button>
                            ) : null}
                            {canDelete ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                disabled={deletingId === asset.id}
                                onClick={() => void handleDelete(asset)}
                              >
                                {deletingId === asset.id ? (
                                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4 mr-1" />
                                )}
                                Excluir
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </div>

          <InventoryAssetModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            mode={modalMode}
            asset={editing}
            saving={saving}
            canManageTypes={canEdit}
            onSubmit={handleSave}
          />

          <InventoryAttachmentPreviewDialog
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            companyId={companyId}
            fileId={previewFile?.id ?? null}
            fileName={previewFile?.originalName}
          />
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
