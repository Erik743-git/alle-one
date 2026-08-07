"use client";

import { Building2, Headphones } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DASHBOARD_CLIENT_ALLE_HINT,
  DASHBOARD_CLIENT_ALLE_LABEL,
  DASHBOARD_CLIENT_INTERNAL_HINT,
  DASHBOARD_CLIENT_INTERNAL_LABEL,
} from "@/lib/module-copy";
import type { DashboardClientViewMode } from "@/lib/services/dashboard-chart-presets.service";

type Props = {
  viewMode: DashboardClientViewMode;
  onChange: (mode: DashboardClientViewMode) => void;
};

export function ClientDashboardViewToggle({ viewMode, onChange }: Props) {
  const isAlle = viewMode === "ALLE";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Visão
      </span>

      <div
        role="tablist"
        aria-label="Visão do ambiente"
        className="relative inline-grid grid-cols-2 rounded-lg bg-muted/50 p-0.5 ring-1 ring-border/50"
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-md",
            "bg-gradient-to-r from-primary/25 via-sky-400/20 to-teal-400/15",
            "ring-1 ring-primary/25 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            isAlle ? "translate-x-0" : "translate-x-[calc(100%+0.125rem)]",
          )}
        />

        <button
          type="button"
          role="tab"
          aria-selected={isAlle}
          title={DASHBOARD_CLIENT_ALLE_HINT}
          onClick={() => onChange("ALLE")}
          className={cn(
            "relative z-10 inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
            "transition-colors duration-300",
            isAlle
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Headphones
            className={cn(
              "size-3 transition-colors duration-300",
              isAlle ? "text-primary" : "text-muted-foreground/70",
            )}
          />
          {DASHBOARD_CLIENT_ALLE_LABEL}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={!isAlle}
          title={DASHBOARD_CLIENT_INTERNAL_HINT}
          onClick={() => onChange("INTERNAL")}
          className={cn(
            "relative z-10 inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
            "transition-colors duration-300",
            !isAlle
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Building2
            className={cn(
              "size-3 transition-colors duration-300",
              !isAlle ? "text-teal-500" : "text-muted-foreground/70",
            )}
          />
          {DASHBOARD_CLIENT_INTERNAL_LABEL}
        </button>
      </div>

      <p
        key={viewMode}
        className="animate-in fade-in-0 text-[11px] text-muted-foreground duration-300 sm:max-w-md"
      >
        {isAlle ? DASHBOARD_CLIENT_ALLE_HINT : DASHBOARD_CLIENT_INTERNAL_HINT}
      </p>
    </div>
  );
}
