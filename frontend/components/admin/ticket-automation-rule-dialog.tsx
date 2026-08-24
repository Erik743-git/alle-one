"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { ClassificationCascadeFields } from "@/components/tickets/classification-cascade-fields";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field-label";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";
import { Input } from "@/components/ui/input";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { notifyError } from "@/lib/notify";
import {
  adminService,
  type TicketAutomationAction,
  type TicketAutomationRule,
  type TicketAutomationRulePayload,
  type TicketStage,
} from "@/lib/services/admin.service";
import {
  ticketsService,
  type TicketCreateCatalogs,
} from "@/lib/services/tickets.service";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: TicketAutomationRule | null;
  stages: TicketStage[];
  onSaved: () => void;
};

function FlowStep({
  title,
  children,
  isLast = false,
}: {
  title: string;
  children: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <div className={isLast ? "relative" : "relative pb-8"}>
      <div
        className="absolute left-0 top-1.5 size-3 rounded-full bg-primary ring-4 ring-background"
        aria-hidden
      />
      {!isLast ? (
        <div
          className="absolute left-[5px] top-4 h-[calc(100%-4px)] w-px bg-primary/35"
          aria-hidden
        />
      ) : null}
      <div className="pl-6">
        <p className="mb-3 text-sm font-semibold text-foreground">{title}</p>
        {children}
      </div>
    </div>
  );
}

function emptyAction(): TicketAutomationAction {
  return { type: "SET_STAGE", stageName: "" };
}

export function TicketAutomationRuleDialog({
  open,
  onOpenChange,
  editing,
  stages,
  onSaved,
}: Props) {
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalogs, setCatalogs] = useState<TicketCreateCatalogs | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [deskId, setDeskId] = useState("");
  const [clientId, setClientId] = useState("");
  const [classificationId, setClassificationId] = useState<string | null>(null);
  const [stageOnEntry, setStageOnEntry] = useState("");
  const [stageOnExit, setStageOnExit] = useState("");
  const [actions, setActions] = useState<TicketAutomationAction[]>([
    emptyAction(),
  ]);

  const stageOptions = useMemo(
    () =>
      stages
        .filter((stage) => stage.active)
        .map((stage) => ({ value: stage.name, label: stage.name })),
    [stages],
  );

  const classificationLevelLabels = useMemo(() => {
    const labels: Record<number, string> = {};
    for (const item of catalogs?.classification?.levelLabels ?? []) {
      labels[item.level] = item.label;
    }
    return labels;
  }, [catalogs]);

  const loadCatalogs = useCallback(async (desk?: number, client?: number) => {
    try {
      setLoadingCatalogs(true);
      const data = await ticketsService.createCatalogs({
        deskId: desk,
        clientId: client,
      });
      setCatalogs(data);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível carregar catálogos.",
      );
      setCatalogs(null);
    } finally {
      setLoadingCatalogs(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setDescription(editing.description ?? "");
      setActive(editing.active);
      setDeskId(
        editing.conditions.deskExternalId != null
          ? String(editing.conditions.deskExternalId)
          : "",
      );
      setClientId(
        editing.conditions.clientExternalId != null
          ? String(editing.conditions.clientExternalId)
          : "",
      );
      setClassificationId(editing.conditions.classificationId ?? null);
      setStageOnEntry(editing.conditions.stageOnEntry ?? "");
      setStageOnExit(editing.conditions.stageOnExit ?? "");
      setActions(
        editing.actions.length ? editing.actions : [emptyAction()],
      );
      void loadCatalogs(
        editing.conditions.deskExternalId ?? undefined,
        editing.conditions.clientExternalId ?? undefined,
      );
    } else {
      setName("");
      setDescription("");
      setActive(true);
      setDeskId("");
      setClientId("");
      setClassificationId(null);
      setStageOnEntry("");
      setStageOnExit("");
      setActions([emptyAction()]);
      void loadCatalogs();
    }
  }, [open, editing, loadCatalogs]);

  useEffect(() => {
    if (!open) return;
    const parsedDesk = deskId ? Number(deskId) : undefined;
    const parsedClient = clientId ? Number(clientId) : undefined;
    if (deskId && !Number.isFinite(parsedDesk)) return;
    if (clientId && !Number.isFinite(parsedClient)) return;
    void loadCatalogs(parsedDesk, parsedClient);
  }, [deskId, clientId, open, loadCatalogs]);

  useEffect(() => {
    if (!open || editing) return;
    if (deskId) return;
    setClassificationId(null);
  }, [deskId, open, editing]);

  function updateAction(index: number, next: TicketAutomationAction) {
    setActions((prev) => prev.map((item, i) => (i === index ? next : item)));
  }

  function removeAction(index: number) {
    setActions((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== index),
    );
  }

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      notifyError("Informe o nome da automação.");
      return;
    }

    const hasCondition =
      deskId ||
      clientId ||
      classificationId ||
      stageOnEntry.trim() ||
      stageOnExit.trim();
    if (!hasCondition) {
      notifyError("Informe ao menos uma condição.");
      return;
    }

    const normalizedActions = actions.filter((action) => {
      if (action.type === "SET_STAGE") return action.stageName.trim();
      if (action.type === "SET_RESPONSIBLE") {
        return Number.isFinite(action.responsibleExternalId);
      }
      if (action.type === "ADD_APPOINTMENT") {
        return action.description.trim();
      }
      return false;
    });

    if (!normalizedActions.length) {
      notifyError("Informe ao menos uma ação válida.");
      return;
    }

    const payload: TicketAutomationRulePayload = {
      name: trimmedName,
      description: description.trim() || undefined,
      active,
      trigger: "STAGE_CHANGE",
      conditions: {
        deskExternalId: deskId ? Number(deskId) : null,
        clientExternalId: clientId ? Number(clientId) : null,
        classificationId,
        stageOnEntry: stageOnEntry.trim() || null,
        stageOnExit: stageOnExit.trim() || null,
      },
      actions: normalizedActions,
    };

    try {
      setSaving(true);
      if (editing) {
        await adminService.updateTicketAutomationRule(editing.id, payload);
      } else {
        await adminService.createTicketAutomationRule(payload);
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível salvar a automação.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle>
            {editing ? "Editar automação" : "Nova automação"}
          </SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <FieldLabel required>Nome</FieldLabel>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Fluidra — Infraestrutura"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <FieldLabel>Descrição</FieldLabel>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Digite sua descrição"
                  rows={3}
                />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <FlipCheckbox
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                Automação ativa
              </label>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/10 p-5">
              <FlowStep title="Quando isto acontecer">
                <SearchableSelectField
                  value="STAGE_CHANGE"
                  onChange={() => undefined}
                  options={[
                    {
                      value: "STAGE_CHANGE",
                      label: "Ticket alterar o estágio",
                    },
                  ]}
                  disabled
                />
              </FlowStep>

              <FlowStep title="Condições se isto for satisfeito">
                {loadingCatalogs && !catalogs ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Carregando catálogos…
                  </div>
                ) : (
                  <div className="space-y-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">se</span>
                      <span className="font-medium">catálogo</span>
                      <span className="text-muted-foreground">igual a</span>
                      <SearchableSelectField
                        value={deskId}
                        onChange={setDeskId}
                        options={[
                          { value: "", label: "Qualquer" },
                          ...(catalogs?.desks ?? []).map((desk) => ({
                            value: String(desk.id),
                            label: desk.name,
                          })),
                        ]}
                        placeholder="Selecione"
                        className="min-w-[180px]"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">e</span>
                      <span className="font-medium">estágio</span>
                      <span className="text-muted-foreground">igual a</span>
                      <SearchableSelectField
                        value={stageOnEntry}
                        onChange={setStageOnEntry}
                        options={[
                          { value: "", label: "Qualquer" },
                          ...stageOptions,
                        ]}
                        placeholder="Selecione o estágio"
                        className="min-w-[180px]"
                      />
                      <span className="text-muted-foreground">na entrada</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">ou</span>
                      <span className="font-medium">estágio</span>
                      <span className="text-muted-foreground">igual a</span>
                      <SearchableSelectField
                        value={stageOnExit}
                        onChange={setStageOnExit}
                        options={[
                          { value: "", label: "Qualquer" },
                          ...stageOptions,
                        ]}
                        placeholder="Selecione o estágio"
                        className="min-w-[180px]"
                      />
                      <span className="text-muted-foreground">na saída</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">e</span>
                      <span className="font-medium">cliente</span>
                      <span className="text-muted-foreground">igual a</span>
                      <SearchableSelectField
                        value={clientId}
                        onChange={setClientId}
                        options={[
                          { value: "", label: "Qualquer" },
                          ...(catalogs?.clients ?? []).map((client) => ({
                            value: String(client.id),
                            label: client.name,
                          })),
                        ]}
                        placeholder="Selecione"
                        className="min-w-[180px]"
                      />
                    </div>

                    {(catalogs?.classification?.tree?.length ?? 0) > 0 ? (
                      <div className="space-y-2 border-t border-border/60 pt-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Classificação (opcional)
                        </p>
                        <ClassificationCascadeFields
                          serviceDeskId={
                            catalogs?.portalServiceDesk?.id ?? null
                          }
                          tree={catalogs?.classification?.tree ?? null}
                          value={classificationId}
                          onChange={setClassificationId}
                          disabled={!deskId}
                          levelLabels={classificationLevelLabels}
                        />
                      </div>
                    ) : null}
                  </div>
                )}
              </FlowStep>

              <FlowStep title="Então faça isto" isLast>
                <div className="space-y-3">
                  {actions.map((action, index) => (
                    <div
                      key={index}
                      className="rounded-lg border border-border/70 bg-background/60 p-3"
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <FieldLabel>Ação {index + 1}</FieldLabel>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          disabled={actions.length <= 1}
                          onClick={() => removeAction(index)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      <SearchableSelectField
                        value={action.type}
                        onChange={(value) => {
                          if (value === "SET_STAGE") {
                            updateAction(index, {
                              type: "SET_STAGE",
                              stageName:
                                action.type === "SET_STAGE"
                                  ? action.stageName
                                  : "",
                            });
                          } else if (value === "SET_RESPONSIBLE") {
                            updateAction(index, {
                              type: "SET_RESPONSIBLE",
                              responsibleExternalId:
                                action.type === "SET_RESPONSIBLE"
                                  ? action.responsibleExternalId
                                  : 0,
                            });
                          } else {
                            updateAction(index, {
                              type: "ADD_APPOINTMENT",
                              description:
                                action.type === "ADD_APPOINTMENT"
                                  ? action.description
                                  : "",
                              notifyClient:
                                action.type === "ADD_APPOINTMENT"
                                  ? action.notifyClient
                                  : false,
                            });
                          }
                        }}
                        options={[
                          { value: "SET_STAGE", label: "Alterar estágio" },
                          {
                            value: "SET_RESPONSIBLE",
                            label: "Definir responsável",
                          },
                          {
                            value: "ADD_APPOINTMENT",
                            label: "Registrar apontamento",
                          },
                        ]}
                        className="mb-3"
                      />

                      {action.type === "SET_STAGE" ? (
                        <SearchableSelectField
                          value={action.stageName}
                          onChange={(value) =>
                            updateAction(index, {
                              type: "SET_STAGE",
                              stageName: value,
                            })
                          }
                          options={stageOptions}
                          placeholder="Estágio de destino"
                        />
                      ) : null}

                      {action.type === "SET_RESPONSIBLE" ? (
                        <SearchableSelectField
                          value={
                            action.responsibleExternalId
                              ? String(action.responsibleExternalId)
                              : ""
                          }
                          onChange={(value) =>
                            updateAction(index, {
                              type: "SET_RESPONSIBLE",
                              responsibleExternalId: Number(value),
                            })
                          }
                          options={(catalogs?.responsibles ?? []).map(
                            (row) => ({
                              value: String(row.id),
                              label: row.name,
                            }),
                          )}
                          placeholder="Responsável"
                        />
                      ) : null}

                      {action.type === "ADD_APPOINTMENT" ? (
                        <div className="space-y-2">
                          <Textarea
                            value={action.description}
                            onChange={(e) =>
                              updateAction(index, {
                                type: "ADD_APPOINTMENT",
                                description: e.target.value,
                                notifyClient: action.notifyClient,
                              })
                            }
                            placeholder="Texto do apontamento"
                            rows={3}
                          />
                          <label className="flex items-center gap-2 text-sm">
                            <FlipCheckbox
                              checked={Boolean(action.notifyClient)}
                              onChange={(e) =>
                                updateAction(index, {
                                  type: "ADD_APPOINTMENT",
                                  description: action.description,
                                  notifyClient: e.target.checked,
                                })
                              }
                            />
                            Notificar cliente
                          </label>
                        </div>
                      ) : null}
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setActions((prev) => [...prev, emptyAction()])
                    }
                  >
                    <Plus className="mr-2 size-4" />
                    Adicionar ação
                  </Button>
                </div>
              </FlowStep>
            </div>
          </div>
        </div>

        <SheetFooter className="border-t border-border px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Salvando…
              </>
            ) : (
              "Salvar automação"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function formatAutomationSummary(rule: TicketAutomationRule): string {
  const parts: string[] = ["Ticket alterar o estágio"];
  const { conditions } = rule;
  const cond: string[] = [];
  if (conditions.deskExternalId != null) cond.push("catálogo");
  if (conditions.stageOnEntry) cond.push(`entrada → ${conditions.stageOnEntry}`);
  if (conditions.stageOnExit) cond.push(`saída → ${conditions.stageOnExit}`);
  if (conditions.clientExternalId != null) cond.push("cliente");
  if (conditions.classificationId) cond.push("classificação");
  if (cond.length) parts.push(cond.join(" · "));
  parts.push(`${rule.actions.length} ação(ões)`);
  return parts.join(" · ");
}

export { formatAutomationSummary };
