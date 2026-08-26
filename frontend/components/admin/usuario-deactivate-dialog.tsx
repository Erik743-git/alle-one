"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type UsuarioDeactivateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuarioNome?: string;
  erro?: string;
  loading?: boolean;
  onConfirm: () => void;
};

export function UsuarioDeactivateDialog({
  open,
  onOpenChange,
  usuarioNome,
  erro,
  loading = false,
  onConfirm,
}: UsuarioDeactivateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          font-sans
          flex max-h-[90vh] w-[95vw] max-w-[520px] flex-col overflow-hidden
          border border-border bg-card p-0 text-card-foreground
        "
      >
        <div className="shrink-0 border-b border-border px-6 py-6">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
              <TriangleAlert size={22} />
            </div>

            <div className="space-y-1">
              <DialogTitle className="text-2xl font-bold text-foreground">
                Desativar usuário
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Essa ação irá inativar o usuário no sistema, sem excluir os
                dados do cadastro.
              </DialogDescription>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 py-6">
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">Usuário selecionado</p>
            <p className="mt-1 text-base font-bold text-foreground">
              {usuarioNome ?? "Usuário"}
            </p>
          </div>

          {erro ? (
            <div className="alle-alert-error mt-5 rounded-xl px-3 py-2 text-sm">
              {erro}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-border bg-card px-6 pt-4 pb-6">
          <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-11"
            >
              Cancelar
            </Button>

            <Button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="h-11"
              variant="destructive"
            >
              {loading ? "Desativando..." : "Desativar usuário"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
