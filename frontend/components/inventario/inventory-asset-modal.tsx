"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import type { InventoryAsset } from "@/lib/services/inventario.service";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  asset?: InventoryAsset | null;
  saving?: boolean;
  onSubmit: (payload: {
    name: string;
    unit: string;
    dueDate: string;
    notes: string;
    file: File | null;
    removeAttachment: boolean;
    clearDueDate: boolean;
  }) => void | Promise<void>;
};

export function InventoryAssetModal({
  open,
  onOpenChange,
  mode,
  asset,
  saving,
  onSubmit,
}: Props) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && asset) {
      setName(asset.name);
      setUnit(asset.unit ?? "");
      setDueDate(asset.dueDate ?? "");
      setNotes(asset.notes ?? "");
    } else {
      setName("");
      setUnit("");
      setDueDate("");
      setNotes("");
    }
    setFile(null);
    setRemoveAttachment(false);
  }, [open, mode, asset]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    void onSubmit({
      name: name.trim(),
      unit: unit.trim(),
      dueDate: dueDate.trim(),
      notes: notes.trim(),
      file,
      removeAttachment,
      clearDueDate: mode === "edit" && !dueDate.trim() && Boolean(asset?.dueDate),
    });
  }

  const currentFileName =
    file?.name ??
    (removeAttachment ? null : asset?.file?.originalName ?? null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Adicionar ativo" : "Editar ativo"}
          </DialogTitle>
          <DialogDescription>
            Preencha os dados do item de inventário. A data de vencimento gera
            alerta no correio quando estiver próxima ou vencida.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inv-name">Ativo *</Label>
            <Input
              id="inv-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do ativo"
              required
              maxLength={255}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="inv-unit">UN</Label>
            <Input
              id="inv-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="Unidade"
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="inv-due">Data de vencimento</Label>
            <Input
              id="inv-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="inv-notes">Observações</Label>
            <Textarea
              id="inv-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Observações sobre o ativo"
            />
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
            <Button type="submit" disabled={saving || !name.trim()}>
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
  );
}
