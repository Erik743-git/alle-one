"use client";

import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DASHBOARD_CLIENT_ALLE_HINT,
  DASHBOARD_CLIENT_ALLE_LABEL,
  DASHBOARD_CLIENT_INTERNAL_HINT,
  DASHBOARD_CLIENT_INTERNAL_LABEL,
  DASHBOARD_EDIT_CHART_LABEL,
} from "@/lib/module-copy";
import type { DashboardClientViewMode } from "@/lib/services/dashboard-chart-presets.service";

type Props = {
  viewMode: DashboardClientViewMode;
  onChange: (mode: DashboardClientViewMode) => void;
  onEditChart: () => void;
};

export function ClientDashboardViewToggle({
  viewMode,
  onChange,
  onEditChart,
}: Props) {
  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Visão do ambiente
        </p>
        <div className="inline-flex rounded-lg border border-border p-0.5">
          <button
            type="button"
            onClick={() => onChange("ALLE")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition",
              viewMode === "ALLE"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {DASHBOARD_CLIENT_ALLE_LABEL}
          </button>
          <button
            type="button"
            onClick={() => onChange("INTERNAL")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition",
              viewMode === "INTERNAL"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {DASHBOARD_CLIENT_INTERNAL_LABEL}
          </button>
        </div>
        <p className="max-w-xl text-xs text-muted-foreground">
          {viewMode === "ALLE"
            ? DASHBOARD_CLIENT_ALLE_HINT
            : DASHBOARD_CLIENT_INTERNAL_HINT}
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onEditChart}>
        <Pencil className="mr-2 size-3.5" />
        {DASHBOARD_EDIT_CHART_LABEL}
      </Button>
    </div>
  );
}
