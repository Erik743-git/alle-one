"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { InventoryAssetTypeDialog } from "@/components/inventario/inventory-asset-type-dialog";
import {
  INVENTORY_DEFAULT_SUPPLIER,
  INVENTORY_REMINDER_OPTIONS,
  inventarioService,
  type InventoryAsset,
  type InventoryAssetType,
} from "@/lib/services/inventario.service";
import { notifyError, notifySuccess } from "@/lib/notify";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  asset?: InventoryAsset | null;
  saving?: boolean;
  canManageTypes?: boolean;
  onSubmit: (payload: {
    assetTypeId: string;
    brand: string;
    quantity: string;
    supplierThirdParty: boolean;
    supplier: string;
    description: string;
    dueDate: string;
    reminderDaysBefore: string;
    file: File | null;
    removeAttachment: boolean;
    clearDueDate: boolean;
    clearReminder: boolean;
  }) => void | Promise<void>;
};

export function InventoryAssetModal({
  open,
  onOpenChange,
  mode,
  asset,
  saving,
  canManageTypes = true,
  onSubmit,
}: Props) {
  const [assetTypes, setAssetTypes] = useState<InventoryAssetType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [assetTypeId, setAssetTypeId] = useState("");
  const [brand, setBrand] = useState("");
  const [quantity, setQuantity] = useState("");
  const [supplierThirdParty, setSupplierThirdParty] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [reminderDaysBefore, setReminderDaysBefore] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [savingType, setSavingType] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        setLoadingTypes(true);
        const types = await inventarioService.listAssetTypes();
        const normalized = Array.isArray(types) ? types : [];
        if (!cancelled) setAssetTypes(normalized);
      } catch (err) {
        if (!cancelled) {
          notifyError(
            err instanceof Error
              ? err.message
              : "Não foi possível carregar os tipos de ativo.",
          );
          setAssetTypes([]);
        }
      } finally {
        if (!cancelled) setLoadingTypes(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && asset) {
      setAssetTypeId(asset.assetTypeId);
      setBrand(asset.brand ?? "");
      setQuantity(asset.quantity != null ? String(asset.quantity) : "");
      setSupplierThirdParty(asset.supplierThirdParty ?? false);
      setSupplier(
        asset.supplierThirdParty ? (asset.supplier ?? "") : "",
      );
      setDescription(asset.description ?? "");
      setDueDate(asset.dueDate ?? "");
      setReminderDaysBefore(
        asset.reminderDaysBefore != null ? String(asset.reminderDaysBefore) : "",
      );
    } else {
      setAssetTypeId("");
      setBrand("");
      setQuantity("");
      setSupplierThirdParty(false);
      setSupplier("");
      setDescription("");
      setDueDate("");
      setReminderDaysBefore("");
    }
    setFile(null);
    setRemoveAttachment(false);
  }, [open, mode, asset]);

  const typeOptions = useMemo(() => {
    const base = Array.isArray(assetTypes) ? assetTypes : [];
    return base.map((t) => ({ value: t.id, label: t.name }));
  }, [assetTypes]);

  async function handleCreateType(name: string) {
    try {
      setSavingType(true);
      const created = await inventarioService.createAssetType(name);
      setAssetTypes((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      );
      setAssetTypeId(created.id);
      setTypeDialogOpen(false);
      notifySuccess("Tipo de ativo cadastrado.");
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível cadastrar o tipo.",
      );
    } finally {
      setSavingType(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assetTypeId) return;
    if (supplierThirdParty && !supplier.trim()) {
      notifyError("Informe o nome do fornecedor terceiro.");
      return;
    }
    void onSubmit({
      assetTypeId,
      brand: brand.trim(),
      quantity: quantity.trim(),
      supplierThirdParty,
      supplier: supplierThirdParty ? supplier.trim() : "",
      description: description.trim(),
      dueDate: dueDate.trim(),
      reminderDaysBefore: dueDate.trim() ? reminderDaysBefore : "",
      file,
      removeAttachment,
      clearDueDate: mode === "edit" && !dueDate.trim() && Boolean(asset?.dueDate),
      clearReminder: Boolean(
        mode === "edit" &&
          dueDate.trim() &&
          !reminderDaysBefore &&
          asset?.reminderDaysBefore != null,
      ),
    });
  }

  const currentFileName =
    file?.name ??
    (removeAttachment ? null : (asset?.file?.originalName ?? null));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[min(96vw,720px)] max-w-[720px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? "Adicionar ativo" : "Editar ativo"}
            </DialogTitle>
            <DialogDescription>
              Selecione o tipo de ativo, informe a descrição e a data de vencimento.
              O lembrete dispara alerta no correio antes do vencimento.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Ativo *</Label>
                {canManageTypes ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setTypeDialogOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Adicionar ativo
                  </Button>
                ) : null}
              </div>
              <SearchableSelectField
                value={assetTypeId}
                onChange={setAssetTypeId}
                options={typeOptions}
                loading={loadingTypes}
                placeholder="Selecione o tipo de ativo"
                emptyLabel="Nenhum tipo cadastrado"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inv-brand">Marca</Label>
                <Input
                  id="inv-brand"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  maxLength={120}
                  placeholder="Ex.: Dell, HP, Cisco…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-quantity">Quantidade</Label>
                <Input
                  id="inv-quantity"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Ex.: 1"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="inv-supplier-third">Fornecedor terceiro?</Label>
                  <p className="text-xs text-muted-foreground">
                    Não: preenche automaticamente “{INVENTORY_DEFAULT_SUPPLIER}”.
                    Sim: informe o fornecedor.
                  </p>
                </div>
                <Switch
                  id="inv-supplier-third"
                  checked={supplierThirdParty}
                  aria-label="Fornecedor terceiro"
                  onCheckedChange={(checked) => {
                    setSupplierThirdParty(checked);
                    if (!checked) setSupplier("");
                  }}
                />
              </div>
              {supplierThirdParty ? (
                <Input
                  id="inv-supplier"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  maxLength={160}
                  placeholder="Nome do fornecedor"
                />
              ) : (
                <Input value={INVENTORY_DEFAULT_SUPPLIER} disabled readOnly />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="inv-description">Descrição</Label>
              <Textarea
                id="inv-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Detalhes do ativo"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inv-due">Data de vencimento</Label>
              <DatePickerField
                modal
                allowClear
                value={dueDate}
                onChange={(value) => {
                  setDueDate(value);
                  if (!value) setReminderDaysBefore("");
                }}
                placeholder="Selecione a data"
              />
            </div>

            <div className="space-y-2">
              <Label>Lembrete</Label>
              <SearchableSelectField
                value={reminderDaysBefore}
                onChange={setReminderDaysBefore}
                disabled={!dueDate.trim()}
                options={INVENTORY_REMINDER_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
                placeholder={
                  dueDate.trim()
                    ? "Selecione quando avisar"
                    : "Informe a data de vencimento"
                }
              />
              <p className="text-xs text-muted-foreground">
                Aviso no correio 90, 30, 15 ou 7 dias antes do vencimento.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inv-file">Anexo</Label>
              <Input
                id="inv-file"
                type="file"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  if (e.target.files?.[0]) setRemoveAttachment(false);
                }}
              />
              {mode === "edit" && asset?.file && !removeAttachment && !file ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">Atual: {asset.file.originalName}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRemoveAttachment(true)}
                  >
                    Remover anexo
                  </Button>
                </div>
              ) : null}
              {removeAttachment ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  O anexo atual será removido ao salvar.
                </p>
              ) : null}
              {currentFileName && file ? (
                <p className="text-xs text-muted-foreground">
                  Novo arquivo: {currentFileName}
                </p>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !assetTypeId}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando…
                  </>
                ) : mode === "create" ? (
                  "Adicionar"
                ) : (
                  "Salvar"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <InventoryAssetTypeDialog
        open={typeDialogOpen}
        onOpenChange={setTypeDialogOpen}
        saving={savingType}
        onSubmit={handleCreateType}
      />
    </>
  );
}
