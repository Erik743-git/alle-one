"use client";

import { useEffect, useState } from "react";
import { Layers, Loader2, StickyNote, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { projetosService } from "@/lib/services/projetos.service";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  onSaved: () => void;
};

export function ProjectPhaseModal({
  open,
  onOpenChange,
  projectId,
  onSaved,
}: Props) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setNotes("");
  }, [open]);

  async function handleSubmit() {
    if (!projectId || !name.trim()) return;
    try {
      setSaving(true);
      await projetosService.createPhase(projectId, {
        name: name.trim(),
        notes: notes.trim() || undefined,
      });
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="font-sans flex max-h-[90vh] w-[95vw] max-w-[520px] flex-col overflow-hidden border border-border bg-card p-0 text-card-foreground"
      >
        <div className="relative shrink-0 border-b border-border px-5 py-5 sm:px-6">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Layers size={22} />
            </div>
            <div className="space-y-1">
              <DialogTitle className="text-xl font-bold text-foreground">
                Adicionar fase
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Fases organizam o cronograma. Depois, adicione atividades dentro de cada fase.
              </DialogDescription>
            </div>
          </DialogHeader>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="space-y-2">
            <Label htmlFor="phase-name" className="text-sm font-semibold text-foreground">
              Nome da fase
            </Label>
            <Input
              id="phase-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Planejamento, Desenvolvimento, Homologação"
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phase-notes" className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <StickyNote className="h-4 w-4 text-muted-foreground" />
              Observações
            </Label>
            <Textarea
              id="phase-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional"
              className="min-h-[72px]"
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-muted/30 px-5 pt-4 pb-6 sm:flex-row sm:justify-end sm:px-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={saving || !name.trim()}
            onClick={() => void handleSubmit()}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Criar fase
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
