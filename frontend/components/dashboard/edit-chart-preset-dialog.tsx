"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  dashboardChartPresetsService,
  type DashboardChartType,
  type DashboardClientViewMode,
} from "@/lib/services/dashboard-chart-presets.service";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewMode: DashboardClientViewMode;
  companyId: string | null;
  availableDesks: string[];
  initialChartType: DashboardChartType;
  initialDeskNames: string[];
  initialPeriodDays: number;
  onSaved: (next: {
    chartType: DashboardChartType;
    deskNames: string[];
    periodDays: number;
  }) => void;
};

const CHART_OPTIONS = [
  { value: "bar", label: "Barras" },
  { value: "line", label: "Linha" },
  { value: "pie", label: "Pizza (mesas)" },
];

export function EditChartPresetDialog({
  open,
  onOpenChange,
  viewMode,
  companyId,
  availableDesks,
  initialChartType,
  initialDeskNames,
  initialPeriodDays,
  onSaved,
}: Props) {
  const [chartType, setChartType] = useState<string>(initialChartType);
  const [periodDays, setPeriodDays] = useState(String(initialPeriodDays));
  const [selectedDesks, setSelectedDesks] = useState<string[]>(initialDeskNames);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChartType(initialChartType);
    setPeriodDays(String(initialPeriodDays));
    setSelectedDesks(initialDeskNames);
  }, [open, initialChartType, initialPeriodDays, initialDeskNames]);

  const deskOptions = useMemo(
    () => availableDesks.map((d) => ({ value: d, label: d })),
    [availableDesks],
  );

  async function handleSave() {
    const days = Number(periodDays);
    if (!Number.isFinite(days) || days < 7 || days > 365) {
      notifyError("Período deve ser entre 7 e 365 dias.");
      return;
    }
    try {
      setSaving(true);
      await dashboardChartPresetsService.upsert({
        viewMode,
        chartType,
        deskNames: selectedDesks,
        periodDays: Math.round(days),
        companyId,
      });
      notifySuccess("Preferência do gráfico salva.");
      onSaved({
        chartType: (chartType as DashboardChartType) || "bar",
        deskNames: selectedDesks,
        periodDays: Math.round(days),
      });
      onOpenChange(false);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível salvar o preset.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar gráfico</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tipo
            </p>
            <SearchableSelectField
              value={chartType}
              onChange={setChartType}
              options={CHART_OPTIONS}
              emptyLabel="Selecione"
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Período (dias)
            </p>
            <Input
              type="number"
              min={7}
              max={365}
              value={periodDays}
              onChange={(e) => setPeriodDays(e.target.value)}
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Mesas (vazio = todas)
            </p>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {deskOptions.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                  Nenhuma mesa no período atual. Salve o tipo/período e atualize
                  o dashboard.
                </p>
              ) : (
                deskOptions.map((desk) => {
                  const checked = selectedDesks.includes(desk.value);
                  return (
                    <label
                      key={desk.value}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/40"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedDesks((prev) =>
                            checked
                              ? prev.filter((d) => d !== desk.value)
                              : [...prev, desk.value],
                          );
                        }}
                      />
                      <span className="truncate">{desk.label}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
