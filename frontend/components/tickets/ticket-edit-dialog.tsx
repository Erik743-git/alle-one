"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { Textarea } from "@/components/ui/textarea";
import { notifyError, notifySuccess } from "@/lib/notify";
import { normalizeTicketDescriptionForEdit } from "@/lib/appointment-doc";
import {
  ticketsService,
  type TicketDetailResponse,
  type TicketStagesResponse,
} from "@/lib/services/tickets.service";

type ResponsibleOption = {
  externalId: number;
  name: string;
  email: string | null;
};

type TicketEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketNumber: number;
  detail: TicketDetailResponse;
  stages: TicketStagesResponse | null;
  onSaved: () => Promise<void> | void;
};

export function TicketEditDialog({
  open,
  onOpenChange,
  ticketNumber,
  detail,
  stages,
  onSaved,
}: TicketEditDialogProps) {
  const ticket = detail.ticket;
  const [title, setTitle] = useState(ticket.title ?? "");
  const [description, setDescription] = useState(() =>
    normalizeTicketDescriptionForEdit(detail.portalDescription?.description),
  );
  const [descriptionBaseline, setDescriptionBaseline] = useState(() =>
    normalizeTicketDescriptionForEdit(detail.portalDescription?.description),
  );
  const [stageId, setStageId] = useState(
    stages?.currentStageId != null ? String(stages.currentStageId) : "",
  );
  const [responsibleId, setResponsibleId] = useState(
    ticket.responsibleName ? "" : "",
  );
  const [responsibles, setResponsibles] = useState<ResponsibleOption[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const editable = normalizeTicketDescriptionForEdit(
      detail.portalDescription?.description,
    );
    setTitle(ticket.title ?? "");
    setDescription(editable);
    setDescriptionBaseline(editable);
    setStageId(
      stages?.currentStageId != null ? String(stages.currentStageId) : "",
    );
    setResponsibleId("");
    let cancelled = false;
    setLoadingCatalogs(true);
    void ticketsService
      .catalogs()
      .then((catalogs) => {
        if (cancelled) return;
        setResponsibles(catalogs.responsibles ?? []);
        const matched = (catalogs.responsibles ?? []).find(
          (r) =>
            r.name.trim().toLowerCase() ===
            (ticket.responsibleName ?? "").trim().toLowerCase(),
        );
        if (matched) setResponsibleId(String(matched.externalId));
      })
      .catch(() => {
        if (!cancelled) setResponsibles([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalogs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, ticket, detail.portalDescription?.description, stages?.currentStageId]);

  const stageOptions = useMemo(
    () =>
      (stages?.stages ?? []).map((stage) => ({
        value: String(stage.id),
        label: stage.firstStage ? `${stage.name} (inicial)` : stage.name,
      })),
    [stages],
  );

  const responsibleOptions = useMemo(
    () =>
      responsibles.map((r) => ({
        value: String(r.externalId),
        label: r.email ? `${r.name} (${r.email})` : r.name,
      })),
    [responsibles],
  );

  async function handleSave() {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 2) {
      notifyError("Informe um título válido.");
      return;
    }

    const selectedStage = (stages?.stages ?? []).find(
      (s) => String(s.id) === stageId,
    );
    const selectedResponsible = responsibles.find(
      (r) => String(r.externalId) === responsibleId,
    );

    setSaving(true);
    try {
      const descriptionChanged =
        description.trim() !== descriptionBaseline.trim();
      const res = await ticketsService.updateTicket(ticketNumber, {
        title: trimmedTitle,
        ...(descriptionChanged
          ? { description: description.trim() || "(sem descrição)" }
          : {}),
        stageName: selectedStage?.name,
        ...(selectedResponsible
          ? {
              responsibleId: selectedResponsible.externalId,
              responsibleName: selectedResponsible.name,
            }
          : {}),
      });
      notifySuccess(res.message);
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível salvar o ticket.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>Editar ticket #{ticketNumber}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Título</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={saving || ticket.isClosed}
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving || ticket.isClosed}
              rows={6}
              placeholder="Descrição do Ticket"
              className="max-h-64 overflow-y-auto"
            />
            <p className="text-xs text-muted-foreground">
              Texto editável do Ticket. Imagens do e-mail original permanecem
              na visualização do ticket quando existirem.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Estágio</Label>
            <SearchableSelectField
              value={stageId}
              onChange={setStageId}
              options={stageOptions}
              disabled={saving || ticket.isClosed || stageOptions.length === 0}
              placeholder="Selecione o estágio"
              preserveOrder
            />
          </div>

          <div className="space-y-2">
            <Label>Responsável</Label>
            <SearchableSelectField
              value={responsibleId}
              onChange={setResponsibleId}
              options={responsibleOptions}
              loading={loadingCatalogs}
              disabled={saving || ticket.isClosed || loadingCatalogs}
              placeholder="Selecione o responsável"
              emptyLabel="Sem responsável"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={saving || ticket.isClosed}
            onClick={() => void handleSave()}
          >
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
