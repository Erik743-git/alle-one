"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, LineChart, PieChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { notifyError, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  dashboardChartPresetsService,
  type DashboardChartKey,
  type DashboardChartType,
  type DashboardClientViewMode,
} from "@/lib/services/dashboard-chart-presets.service";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chartKey: DashboardChartKey;
  chartTitle: string;
  viewMode: DashboardClientViewMode;
  companyId: string | null;
  availableDesks: string[];
  initialChartType: DashboardChartType;
  initialDeskNames: string[];
  initialPeriodDays: number;
  onSaved: (next: {
    chartKey: DashboardChartKey;
    chartType: DashboardChartType;
    deskNames: string[];
    periodDays: number;
  }) => void;
};

const CHART_OPTIONS_FULL = [
  { value: "bar", label: "Barras" },
  { value: "line", label: "Linha" },
  { value: "pie", label: "Pizza (mesas)" },
];

const CHART_OPTIONS_BASIC = [
  { value: "bar", label: "Barras" },
  { value: "line", label: "Linha" },
];

function ChartTypePreview({ chartType }: { chartType: string }) {
  if (chartType === "line") {
    return (
      <div className="flex h-full flex-col justify-end gap-1 px-3 pb-3 pt-4">
        <svg viewBox="0 0 120 56" className="h-full w-full" aria-hidden>
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-primary"
            points="4,42 28,28 52,34 76,16 100,22 116,10"
          />
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeOpacity="0.45"
            className="text-sky-400"
            points="4,48 28,40 52,44 76,30 100,36 116,24"
          />
        </svg>
      </div>
    );
  }

  if (chartType === "pie") {
    return (
      <div className="flex h-full items-center justify-center">
        <div
          className="size-24 rounded-full"
          style={{
            background:
              "conic-gradient(#38bdf8 0 28%, #818cf8 28% 52%, #34d399 52% 74%, #fbbf24 74% 100%)",
          }}
          aria-hidden
        />
      </div>
    );
  }

  return (
    <div className="flex h-full items-end justify-center gap-2 px-4 pb-3 pt-6">
      {[40, 68, 52, 84, 46, 72].map((h, i) => (
        <div
          key={i}
          className={cn(
            "w-3 rounded-t-sm",
            i % 2 === 0 ? "bg-primary/80" : "bg-sky-400/70",
          )}
          style={{ height: `${h}%` }}
          aria-hidden
        />
      ))}
    </div>
  );
}

export function EditChartPresetDialog({
  open,
  onOpenChange,
  chartKey,
  chartTitle,
  viewMode,
  companyId,
  availableDesks,
  initialChartType,
  initialDeskNames,
  initialPeriodDays,
  onSaved,
}: Props) {
  const [chartType, setChartType] = useState<string>(initialChartType);
  const [selectedDesks, setSelectedDesks] = useState<string[]>(initialDeskNames);
  const [saving, setSaving] = useState(false);

  const showDesks = chartKey === "CHAMADOS";
  const chartOptions =
    chartKey === "CHAMADOS" ? CHART_OPTIONS_FULL : CHART_OPTIONS_BASIC;

  useEffect(() => {
    if (!open) return;
    setChartType(initialChartType);
    setSelectedDesks(initialDeskNames);
  }, [open, initialChartType, initialDeskNames, chartKey]);

  const deskOptions = useMemo(
    () => availableDesks.map((d) => ({ value: d, label: d })),
    [availableDesks],
  );

  const previewLabel =
    chartOptions.find((o) => o.value === chartType)?.label ?? "Barras";
  const PreviewIcon =
    chartType === "line" ? LineChart : chartType === "pie" ? PieChart : BarChart3;

  async function handleSave() {
    if (!companyId) {
      notifyError("Selecione uma empresa antes de salvar o gráfico.");
      return;
    }
    try {
      setSaving(true);
      await dashboardChartPresetsService.upsert({
        viewMode,
        chartKey,
        chartType,
        deskNames: showDesks ? selectedDesks : [],
        periodDays: initialPeriodDays,
        companyId,
      });
      notifySuccess(`Preferência de “${chartTitle}” salva.`);
      onSaved({
        chartKey,
        chartType: (chartType as DashboardChartType) || "bar",
        deskNames: showDesks ? selectedDesks : [],
        periodDays: initialPeriodDays,
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
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-5 py-4 sm:px-6">
          <DialogTitle>Editar gráfico — {chartTitle}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 px-5 py-5 sm:grid-cols-[1fr_160px] sm:px-6">
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tipo
              </p>
              <SearchableSelectField
                value={chartType}
                onChange={setChartType}
                options={chartOptions}
                emptyLabel="Selecione"
                modal
                preserveOrder
              />
            </div>
            {showDesks ? (
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Mesas
                  </p>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setSelectedDesks([])}
                  >
                    Todas
                  </button>
                </div>
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-border bg-muted/20 p-2">
                  {deskOptions.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-muted-foreground">
                      Nenhuma mesa disponível no momento. Atualize o dashboard e
                      tente de novo.
                    </p>
                  ) : (
                    deskOptions.map((desk) => {
                      const checked = selectedDesks.includes(desk.value);
                      return (
                        <label
                          key={desk.value}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm transition",
                            checked
                              ? "bg-primary/10 text-foreground"
                              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                          )}
                        >
                          <FlipCheckbox
                            checked={checked}
                            onChange={() => {
                              setSelectedDesks((prev) =>
                                checked
                                  ? prev.filter((d) => d !== desk.value)
                                  : [...prev, desk.value],
                              );
                            }}
                          />
                          <span className="truncate font-medium">{desk.label}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Vazio = todas as mesas.{" "}
                  {selectedDesks.length > 0
                    ? `${selectedDesks.length} selecionada(s).`
                    : null}
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Prévia
            </p>
            <div className="flex min-h-[160px] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
                <PreviewIcon className="size-3.5 text-primary" />
                <span className="font-medium text-foreground">{previewLabel}</span>
              </div>
              <div className="relative min-h-[120px] flex-1 bg-gradient-to-b from-muted/30 to-transparent">
                <ChartTypePreview chartType={chartType} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="!mx-0 !mb-0 shrink-0 gap-2 border-t border-border bg-card px-5 pt-4 pb-6 sm:flex-row sm:justify-end sm:px-6 sm:pb-6">
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
