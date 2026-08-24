"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldLabel } from "@/components/ui/field-label";
import { Input } from "@/components/ui/input";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { Switch } from "@/components/ui/switch";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";
import { isAdmin } from "@/lib/access-control";
import { notifyError } from "@/lib/notify";
import type { TicketFilterCatalogs } from "@/lib/services/tickets.service";
import {
  TICKET_LIST_COLUMNS,
  TICKET_LIST_FILTER_FIELD_LABELS,
  TICKET_LIST_GROUP_BY_LABELS,
  TICKET_LIST_PRESET_COLORS,
  buildPresetConfigFromPageState,
  type TicketListFilterField,
  type TicketListGroupBy,
  type TicketListPageState,
  type TicketListPreset,
  type TicketListPresetFilterRule,
} from "@/lib/tickets/list-presets";
import { ticketListPresetsService } from "@/lib/services/ticket-list-presets.service";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageState: TicketListPageState;
  catalogs: TicketFilterCatalogs | null;
  editing?: TicketListPreset | null;
  onSaved: () => void;
};

const FILTER_FIELD_OPTIONS = (
  Object.keys(TICKET_LIST_FILTER_FIELD_LABELS) as TicketListFilterField[]
).map((field) => ({
  value: field,
  label: TICKET_LIST_FILTER_FIELD_LABELS[field],
}));

const GROUP_OPTIONS = (
  Object.keys(TICKET_LIST_GROUP_BY_LABELS) as TicketListGroupBy[]
).map((value) => ({
  value,
  label: TICKET_LIST_GROUP_BY_LABELS[value],
}));

function defaultRule(): TicketListPresetFilterRule {
  return { field: "stageName", value: "" };
}

export function TicketListPresetDialog({
  open,
  onOpenChange,
  pageState,
  catalogs,
  editing,
  onSaved,
}: Props) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(TICKET_LIST_PRESET_COLORS[1]);
  const [isPublic, setIsPublic] = useState(false);
  const [groupBy, setGroupBy] = useState<TicketListGroupBy>("none");
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    TICKET_LIST_COLUMNS.map((c) => c.key),
  );
  const [rules, setRules] = useState<TicketListPresetFilterRule[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setColor(editing.color);
      setIsPublic(editing.isPublic);
      setGroupBy(editing.config.groupBy ?? "none");
      setVisibleColumns(
        editing.config.visibleColumns?.length
          ? editing.config.visibleColumns
          : TICKET_LIST_COLUMNS.map((c) => c.key),
      );
      setRules(editing.config.rules ?? []);
      return;
    }
    const built = buildPresetConfigFromPageState(pageState);
    setName("");
    setColor(TICKET_LIST_PRESET_COLORS[1]);
    setIsPublic(false);
    setGroupBy(pageState.groupBy);
    setVisibleColumns(pageState.visibleColumns);
    setRules(built.rules ?? []);
  }, [open, editing, pageState]);

  const stageOptions = useMemo(
    () =>
      (catalogs?.stages ?? []).map((s) => ({ value: s, label: s })),
    [catalogs],
  );
  const clientOptions = useMemo(
    () =>
      (catalogs?.clients ?? []).map((c) => ({
        value: String(c.externalId),
        label: c.name,
      })),
    [catalogs],
  );
  const responsibleOptions = useMemo(
    () =>
      (catalogs?.responsibles ?? []).map((r) => ({
        value: String(r.externalId),
        label: r.name,
      })),
    [catalogs],
  );
  const deskOptions = useMemo(
    () => (catalogs?.desks ?? []).map((d) => ({ value: d, label: d })),
    [catalogs],
  );

  function renderRuleValue(rule: TicketListPresetFilterRule, index: number) {
    const setValue = (value: string) => {
      setRules((prev) =>
        prev.map((row, i) => (i === index ? { ...row, value } : row)),
      );
    };

    if (rule.field === "mineOnly" || rule.field === "includeDone" || rule.field === "unassigned") {
      return (
        <SearchableSelectField
          value={rule.value || "true"}
          onChange={setValue}
          options={[
            { value: "true", label: "Sim" },
            { value: "false", label: "Não" },
          ]}
          emptyLabel="Sim"
        />
      );
    }
    if (rule.field === "stageName") {
      return (
        <SearchableSelectField
          value={rule.value}
          onChange={setValue}
          options={stageOptions}
          emptyLabel="Selecione o estágio"
        />
      );
    }
    if (rule.field === "clientExternalId") {
      return (
        <SearchableSelectField
          value={rule.value}
          onChange={setValue}
          options={clientOptions}
          emptyLabel="Selecione o cliente"
        />
      );
    }
    if (rule.field === "responsibleExternalId") {
      return (
        <SearchableSelectField
          value={rule.value}
          onChange={setValue}
          options={responsibleOptions}
          emptyLabel="Selecione o responsável"
        />
      );
    }
    if (rule.field === "deskName") {
      return (
        <SearchableSelectField
          value={rule.value}
          onChange={setValue}
          options={deskOptions}
          emptyLabel="Selecione o catálogo"
        />
      );
    }
    if (rule.field === "from" || rule.field === "to") {
      return (
        <Input
          type="date"
          value={rule.value}
          onChange={(e) => setValue(e.target.value)}
          className="h-10"
        />
      );
    }
    return (
      <Input
        value={rule.value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Valor"
        className="h-10"
      />
    );
  }

  async function handleSave() {
    if (!name.trim()) {
      notifyError("Informe o nome do filtro.");
      return;
    }
    if (visibleColumns.length === 0) {
      notifyError("Selecione ao menos uma coluna para exibir.");
      return;
    }

    const config = {
      rules: rules.filter((r) => r.value.trim() || r.field === "unassigned"),
      groupBy,
      visibleColumns: visibleColumns as TicketListPageState["visibleColumns"],
      columnFilters: pageState.columnFilters,
      sortKey: pageState.sortKey,
      sortDir: pageState.sortDir,
    };

    try {
      setSaving(true);
      if (editing) {
        await ticketListPresetsService.update(editing.id, {
          name: name.trim(),
          color,
          isPublic,
          config,
        });
      } else {
        await ticketListPresetsService.create({
          name: name.trim(),
          color,
          isPublic,
          config,
        });
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível salvar o filtro.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto font-sans sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar filtro" : "Novo filtro"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <FieldLabel required>Nome</FieldLabel>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Meus tickets"
                className="h-11"
              />
            </div>
            {isAdmin() ? (
              <div className="space-y-2">
                <FieldLabel>Público</FieldLabel>
                <div className="flex h-11 items-center gap-2">
                  <Switch
                    checked={isPublic}
                    onCheckedChange={setIsPublic}
                    aria-label="Tornar filtro público"
                  />
                  <span className="text-xs text-muted-foreground">
                    {isPublic ? "Visível para todos" : "Somente você"}
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <FieldLabel required>Cor</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {TICKET_LIST_PRESET_COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  className={cn(
                    "size-8 rounded-full border-2 transition",
                    color === swatch
                      ? "border-foreground ring-2 ring-primary/40"
                      : "border-transparent hover:scale-105",
                  )}
                  style={{ backgroundColor: swatch }}
                  onClick={() => setColor(swatch)}
                  aria-label={`Cor ${swatch}`}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <FieldLabel>Filtrar por</FieldLabel>
            <div className="space-y-2">
              {rules.map((rule, index) => (
                <div key={`${rule.field}-${index}`} className="flex gap-2">
                  <div className="min-w-[140px] flex-1">
                    <SearchableSelectField
                      value={rule.field}
                      onChange={(field) =>
                        setRules((prev) =>
                          prev.map((row, i) =>
                            i === index
                              ? {
                                  field: field as TicketListFilterField,
                                  value: "",
                                }
                              : row,
                          ),
                        )
                      }
                      options={FILTER_FIELD_OPTIONS.map((o) => ({
                        value: o.value,
                        label: o.label,
                      }))}
                      preserveOrder
                      emptyLabel="Campo"
                    />
                  </div>
                  <div className="min-w-0 flex-[1.4]">{renderRuleValue(rule, index)}</div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="shrink-0"
                    onClick={() =>
                      setRules((prev) => prev.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full border-dashed"
                onClick={() => setRules((prev) => [...prev, defaultRule()])}
              >
                <Plus className="mr-2 size-4" />
                Adicionar filtro
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel required>Agrupar por</FieldLabel>
              <SearchableSelectField
                value={groupBy}
                onChange={(v) => setGroupBy(v as TicketListGroupBy)}
                options={GROUP_OPTIONS}
                preserveOrder
                emptyLabel="Nenhum"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel required>Exibir colunas</FieldLabel>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border/60 p-2">
                {TICKET_LIST_COLUMNS.map((col) => {
                  const checked = visibleColumns.includes(col.key);
                  return (
                    <label
                      key={col.key}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/40"
                    >
                      <FlipCheckbox
                        checked={checked}
                        onChange={(e) => {
                          setVisibleColumns((prev) => {
                            if (e.target.checked) {
                              return [...prev, col.key];
                            }
                            return prev.filter((k) => k !== col.key);
                          });
                        }}
                      />
                      {col.label}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={saving} onClick={() => void handleSave()}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
