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
  TICKET_AUTOMATION_ACTION_OPTIONS,
  TICKET_AUTOMATION_TRIGGER_OPTIONS,
  adminService,
  type TicketAutomationAction,
  type TicketAutomationRule,
  type TicketAutomationRulePayload,
  type TicketAutomationSetFieldName,
  type TicketAutomationTrigger,
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

const SET_FIELD_OPTIONS: Array<{
  value: TicketAutomationSetFieldName;
  label: string;
}> = [
  { value: "title", label: "Título" },
  { value: "stageName", label: "Estágio" },
  { value: "statusName", label: "Status" },
  { value: "isClosed", label: "Fechado" },
  { value: "clientId", label: "Cliente" },
  { value: "deskId", label: "Catálogo / mesa" },
  { value: "responsibleId", label: "Responsável" },
];

const EMAIL_RECIPIENT_OPTIONS = [
  { value: "REQUESTOR", label: "Solicitante" },
  { value: "RESPONSIBLE", label: "Responsável" },
  { value: "WATCHERS", label: "Seguidores (CC)" },
  { value: "CUSTOM", label: "E-mail personalizado" },
] as const;

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

function normalizeActionForType(
  type: TicketAutomationAction["type"],
  prev?: TicketAutomationAction,
): TicketAutomationAction {
  switch (type) {
    case "SET_STAGE":
      return {
        type: "SET_STAGE",
        stageName: prev?.type === "SET_STAGE" ? prev.stageName : "",
      };
    case "SET_RESPONSIBLE":
      return {
        type: "SET_RESPONSIBLE",
        responsibleExternalId:
          prev?.type === "SET_RESPONSIBLE" ? prev.responsibleExternalId : 0,
      };
    case "ADD_APPOINTMENT":
      return {
        type: "ADD_APPOINTMENT",
        description: prev?.type === "ADD_APPOINTMENT" ? prev.description : "",
        notifyClient:
          prev?.type === "ADD_APPOINTMENT" ? prev.notifyClient : false,
      };
    case "SET_FIELD":
      return {
        type: "SET_FIELD",
        field: prev?.type === "SET_FIELD" ? prev.field : "title",
        value: prev?.type === "SET_FIELD" ? prev.value : "",
      };
    case "SEND_EMAIL":
      return {
        type: "SEND_EMAIL",
        recipient:
          prev?.type === "SEND_EMAIL" ? prev.recipient : "REQUESTOR",
        customTo: prev?.type === "SEND_EMAIL" ? prev.customTo : "",
        subject: prev?.type === "SEND_EMAIL" ? prev.subject : "",
        body: prev?.type === "SEND_EMAIL" ? prev.body : "",
      };
    case "TRIGGER_WEBHOOK":
      return {
        type: "TRIGGER_WEBHOOK",
        url: prev?.type === "TRIGGER_WEBHOOK" ? prev.url : "",
        secret: prev?.type === "TRIGGER_WEBHOOK" ? prev.secret : "",
      };
    default:
      return emptyAction();
  }
}

function isValidAction(action: TicketAutomationAction): boolean {
  switch (action.type) {
    case "SET_STAGE":
      return Boolean(action.stageName.trim());
    case "SET_RESPONSIBLE":
      return Number.isFinite(action.responsibleExternalId) &&
        action.responsibleExternalId > 0;
    case "ADD_APPOINTMENT":
      return Boolean(action.description.trim());
    case "SET_FIELD":
      if (action.field === "isClosed") return typeof action.value === "boolean";
      if (
        action.field === "clientId" ||
        action.field === "deskId" ||
        action.field === "responsibleId"
      ) {
        return Number.isFinite(Number(action.value)) && Number(action.value) > 0;
      }
      return String(action.value ?? "").trim().length > 0;
    case "SEND_EMAIL":
      return Boolean(action.subject.trim() && action.body.trim());
    case "TRIGGER_WEBHOOK":
      return /^https?:\/\//i.test(action.url.trim());
    default:
      return false;
  }
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
  const [trigger, setTrigger] = useState<TicketAutomationTrigger>("STAGE_CHANGE");
  const [deskId, setDeskId] = useState("");
  const [clientId, setClientId] = useState("");
  const [classificationId, setClassificationId] = useState<string | null>(null);
  const [stageOnEntry, setStageOnEntry] = useState("");
  const [stageOnExit, setStageOnExit] = useState("");
  const [idleMinutes, setIdleMinutes] = useState("");
  const [idleStageName, setIdleStageName] = useState("");
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
      setTrigger(editing.trigger);
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
      setIdleMinutes(
        editing.conditions.idleMinutes != null
          ? String(editing.conditions.idleMinutes)
          : "",
      );
      setIdleStageName(editing.conditions.idleStageName ?? "");
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
      setTrigger("STAGE_CHANGE");
      setDeskId("");
      setClientId("");
      setClassificationId(null);
      setStageOnEntry("");
      setStageOnExit("");
      setIdleMinutes("");
      setIdleStageName("");
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

  function hasValidConditions(): boolean {
    const common =
      Boolean(deskId) ||
      Boolean(clientId) ||
      Boolean(classificationId) ||
      Boolean(idleStageName.trim());

    if (trigger === "STAGE_CHANGE") {
      return Boolean(
        common || stageOnEntry.trim() || stageOnExit.trim(),
      );
    }
    if (trigger === "TICKET_IDLE") {
      const mins = Number(idleMinutes);
      return Number.isFinite(mins) && mins > 0;
    }
    return common;
  }

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      notifyError("Informe o nome da automação.");
      return;
    }

    if (!hasValidConditions()) {
      notifyError("Informe ao menos uma condição.");
      return;
    }

    const normalizedActions = actions.filter(isValidAction);

    if (!normalizedActions.length) {
      notifyError("Informe ao menos uma ação válida.");
      return;
    }

    const parsedIdleMinutes = idleMinutes ? Number(idleMinutes) : null;

    const payload: TicketAutomationRulePayload = {
      name: trimmedName,
      description: description.trim() || undefined,
      active,
      trigger,
      conditions: {
        deskExternalId: deskId ? Number(deskId) : null,
        clientExternalId: clientId ? Number(clientId) : null,
        classificationId,
        stageOnEntry:
          trigger === "STAGE_CHANGE" ? stageOnEntry.trim() || null : null,
        stageOnExit:
          trigger === "STAGE_CHANGE" ? stageOnExit.trim() || null : null,
        idleMinutes:
          trigger === "TICKET_IDLE" &&
          parsedIdleMinutes != null &&
          Number.isFinite(parsedIdleMinutes)
            ? Math.floor(parsedIdleMinutes)
            : null,
        idleStageName:
          trigger === "TICKET_IDLE" ? idleStageName.trim() || null : null,
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

  function renderSetFieldValueInput(
    action: Extract<TicketAutomationAction, { type: "SET_FIELD" }>,
    index: number,
  ) {
    if (action.field === "isClosed") {
      return (
        <SearchableSelectField
          value={String(action.value)}
          onChange={(value) =>
            updateAction(index, {
              ...action,
              value: value === "true",
            })
          }
          options={[
            { value: "true", label: "Sim (fechado)" },
            { value: "false", label: "Não (aberto)" },
          ]}
        />
      );
    }

    if (action.field === "stageName") {
      return (
        <SearchableSelectField
          value={String(action.value ?? "")}
          onChange={(value) => updateAction(index, { ...action, value })}
          options={stageOptions}
          placeholder="Estágio"
        />
      );
    }

    if (action.field === "clientId") {
      return (
        <SearchableSelectField
          value={String(action.value ?? "")}
          onChange={(value) =>
            updateAction(index, { ...action, value: Number(value) })
          }
          options={(catalogs?.clients ?? []).map((client) => ({
            value: String(client.id),
            label: client.name,
          }))}
          placeholder="Cliente"
        />
      );
    }

    if (action.field === "deskId") {
      return (
        <SearchableSelectField
          value={String(action.value ?? "")}
          onChange={(value) =>
            updateAction(index, { ...action, value: Number(value) })
          }
          options={(catalogs?.desks ?? []).map((desk) => ({
            value: String(desk.id),
            label: desk.name,
          }))}
          placeholder="Catálogo"
        />
      );
    }

    if (action.field === "responsibleId") {
      return (
        <SearchableSelectField
          value={String(action.value ?? "")}
          onChange={(value) =>
            updateAction(index, { ...action, value: Number(value) })
          }
          options={(catalogs?.responsibles ?? []).map((row) => ({
            value: String(row.id),
            label: row.name,
          }))}
          placeholder="Responsável"
        />
      );
    }

    return (
      <Input
        value={String(action.value ?? "")}
        onChange={(e) =>
          updateAction(index, { ...action, value: e.target.value })
        }
        placeholder="Valor"
      />
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
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
                  value={trigger}
                  onChange={(value) =>
                    setTrigger(value as TicketAutomationTrigger)
                  }
                  options={TICKET_AUTOMATION_TRIGGER_OPTIONS.map((opt) => ({
                    value: opt.value,
                    label: opt.label,
                  }))}
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
                    {trigger === "TICKET_IDLE" ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-muted-foreground">
                            permanece por
                          </span>
                          <Input
                            type="number"
                            min={1}
                            value={idleMinutes}
                            onChange={(e) => setIdleMinutes(e.target.value)}
                            className="w-24"
                            placeholder="60"
                          />
                          <span className="text-muted-foreground">
                            minuto(s)
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-muted-foreground">no estágio</span>
                          <SearchableSelectField
                            value={idleStageName}
                            onChange={setIdleStageName}
                            options={[
                              { value: "", label: "Qualquer" },
                              ...stageOptions,
                            ]}
                            placeholder="Selecione o estágio"
                            className="min-w-[180px]"
                          />
                        </div>
                      </>
                    ) : null}

                    {trigger === "STAGE_CHANGE" ? (
                      <>
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
                      </>
                    ) : null}

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
                        onChange={(value) =>
                          updateAction(
                            index,
                            normalizeActionForType(
                              value as TicketAutomationAction["type"],
                              action,
                            ),
                          )
                        }
                        options={TICKET_AUTOMATION_ACTION_OPTIONS.map((opt) => ({
                          value: opt.value,
                          label: opt.label,
                        }))}
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

                      {action.type === "SET_FIELD" ? (
                        <div className="space-y-2">
                          <SearchableSelectField
                            value={action.field}
                            onChange={(value) =>
                              updateAction(index, {
                                type: "SET_FIELD",
                                field: value as TicketAutomationSetFieldName,
                                value: "",
                              })
                            }
                            options={SET_FIELD_OPTIONS.map((opt) => ({
                              value: opt.value,
                              label: opt.label,
                            }))}
                          />
                          {renderSetFieldValueInput(action, index)}
                        </div>
                      ) : null}

                      {action.type === "SEND_EMAIL" ? (
                        <div className="space-y-2">
                          <SearchableSelectField
                            value={action.recipient}
                            onChange={(value) =>
                              updateAction(index, {
                                ...action,
                                recipient: value as typeof action.recipient,
                              })
                            }
                            options={EMAIL_RECIPIENT_OPTIONS.map((opt) => ({
                              value: opt.value,
                              label: opt.label,
                            }))}
                          />
                          {action.recipient === "CUSTOM" ? (
                            <Input
                              value={action.customTo ?? ""}
                              onChange={(e) =>
                                updateAction(index, {
                                  ...action,
                                  customTo: e.target.value,
                                })
                              }
                              placeholder="e-mails separados por vírgula"
                            />
                          ) : null}
                          <Input
                            value={action.subject}
                            onChange={(e) =>
                              updateAction(index, {
                                ...action,
                                subject: e.target.value,
                              })
                            }
                            placeholder="Assunto (use {{ticketNumber}}, {{title}}…)"
                          />
                          <Textarea
                            value={action.body}
                            onChange={(e) =>
                              updateAction(index, {
                                ...action,
                                body: e.target.value,
                              })
                            }
                            placeholder="Corpo do e-mail"
                            rows={4}
                          />
                        </div>
                      ) : null}

                      {action.type === "TRIGGER_WEBHOOK" ? (
                        <div className="space-y-2">
                          <Input
                            value={action.url}
                            onChange={(e) =>
                              updateAction(index, {
                                ...action,
                                url: e.target.value,
                              })
                            }
                            placeholder="https://…"
                          />
                          <Input
                            value={action.secret ?? ""}
                            onChange={(e) =>
                              updateAction(index, {
                                ...action,
                                secret: e.target.value,
                              })
                            }
                            placeholder="Secret (opcional, header X-Webhook-Secret)"
                          />
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

        <SheetFooter className="!pb-4 mt-0 shrink-0 flex-row justify-end gap-2 border-t border-border bg-muted/40 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSave()}
            disabled={saving}
          >
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
  const triggerLabel =
    TICKET_AUTOMATION_TRIGGER_OPTIONS.find((opt) => opt.value === rule.trigger)
      ?.label ?? rule.trigger;
  const parts: string[] = [triggerLabel];
  const { conditions } = rule;
  const cond: string[] = [];
  if (conditions.deskExternalId != null) cond.push("catálogo");
  if (conditions.stageOnEntry) cond.push(`entrada → ${conditions.stageOnEntry}`);
  if (conditions.stageOnExit) cond.push(`saída → ${conditions.stageOnExit}`);
  if (conditions.idleMinutes) cond.push(`${conditions.idleMinutes} min parado`);
  if (conditions.idleStageName) cond.push(`estágio ${conditions.idleStageName}`);
  if (conditions.clientExternalId != null) cond.push("cliente");
  if (conditions.classificationId) cond.push("classificação");
  if (cond.length) parts.push(cond.join(" · "));
  parts.push(`${rule.actions.length} ação(ões)`);
  return parts.join(" · ");
}

export { formatAutomationSummary };
