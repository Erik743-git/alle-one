"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  FileText,
  Loader2,
} from "lucide-react";

import AppShell from "@/components/layout/app-shell";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { InventoryAttachmentPreviewDialog } from "@/components/inventario/inventory-attachment-preview-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isClient } from "@/lib/access-control";
import { notifyError } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  inventarioService,
  type InventoryAssetFile,
  type InventoryAssetWithCompany,
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

export default function InventarioTipoPage() {
  const params = useParams<{ assetTypeId: string }>();
  const assetTypeId = params.assetTypeId;
  const clientUser = isClient();

  const [loading, setLoading] = useState(true);
  const [typeName, setTypeName] = useState("");
  const [assets, setAssets] = useState<InventoryAssetWithCompany[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<InventoryAssetFile | null>(null);
  const [previewCompanyId, setPreviewCompanyId] = useState("");

  const load = useCallback(async () => {
    if (!assetTypeId) return;
    try {
      setLoading(true);
      const data = await inventarioService.listAssetsByType(assetTypeId);
      setTypeName(data.assetType.name);
      setAssets(data.assets);
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar os ativos deste tipo.",
      );
    } finally {
      setLoading(false);
    }
  }, [assetTypeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedAssets = useMemo(() => assets, [assets]);

  function openAttachment(asset: InventoryAssetWithCompany) {
    if (!asset.file) return;
    setPreviewCompanyId(asset.companyId);
    setPreviewFile(asset.file);
    setPreviewOpen(true);
  }

  return (
    <ProtectedPage>
      <PermissionGate module="INVENTARIO">
        <AppShell>
          <div className="font-sans w-full space-y-6">
            <div className="space-y-2">
              {!clientUser ? (
                <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
                  <Link href="/inventario">
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Inventário
                  </Link>
                </Button>
              ) : null}
              <h1 className="text-2xl font-semibold tracking-tight truncate">
                {typeName || "Tipo de ativo"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {sortedAssets.length}{" "}
                {sortedAssets.length === 1
                  ? "ativo cadastrado"
                  : "ativos cadastrados"}{" "}
                em todas as empresas
              </p>
            </div>

            {loading ? (
              <div className="flex min-h-[30vh] items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                Carregando ativos…
              </div>
            ) : sortedAssets.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum ativo deste tipo no inventário.
                </CardContent>
              </Card>
            ) : (
              <Accordion type="multiple" className="rounded-lg border bg-card px-4">
                {sortedAssets.map((asset) => {
                  const overdue = isOverdue(asset.dueDate);
                  const title = asset.companyName;
                  return (
                    <AccordionItem key={asset.id} value={asset.id}>
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex flex-1 min-w-0 items-center justify-between gap-3 pr-2">
                          <span className="font-medium truncate flex items-center gap-2">
                            <Building2 className="h-4 w-4 shrink-0 text-primary" />
                            {title}
                          </span>
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
                            <dt className="text-muted-foreground">Empresa</dt>
                            <dd>
                              <Link
                                href={`/inventario/${asset.companyId}`}
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                              >
                                {asset.companyName}
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Marca</dt>
                            <dd>{asset.brand?.trim() || "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Quantidade</dt>
                            <dd>{asset.quantity != null ? asset.quantity : "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Fornecedor</dt>
                            <dd>{asset.supplier?.trim() || "—"}</dd>
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
                                    openAttachment(asset);
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
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </div>

          <InventoryAttachmentPreviewDialog
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            companyId={previewCompanyId}
            fileId={previewFile?.id ?? null}
            fileName={previewFile?.originalName}
          />
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
