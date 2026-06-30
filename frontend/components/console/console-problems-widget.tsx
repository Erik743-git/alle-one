"use client";

import { Check, MessageSquare } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  formatConsoleDuration,
  type ConsoleAlert,
} from "@/lib/services/console.service";
import {
  getSeverityAccent,
  getSeveritySoftBg,
  getZabbixSeverityLabel,
  severityBadgeStyle,
} from "./console-severity";

function formatTimeOnly(clock: number) {
  if (!Number.isFinite(clock) || clock <= 0) return "—";
  return new Date(clock * 1000).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

type ConsoleProblemsWidgetProps = {
  title: string;
  alerts: ConsoleAlert[];
  emptyLabel?: string;
  accent?: "danger" | "default";
  onSelectAlert: (alert: ConsoleAlert) => void;
  onAckAlert?: (alert: ConsoleAlert) => void;
  canAck?: boolean;
  className?: string;
};

export function ConsoleProblemsWidget({
  title,
  alerts,
  emptyLabel = "Nenhum problema ativo.",
  accent = "default",
  onSelectAlert,
  onAckAlert,
  canAck = false,
  className,
}: ConsoleProblemsWidgetProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm",
        className,
      )}
    >
      <header
        className={cn(
          "flex items-center justify-between gap-3 border-b border-border px-4 py-3",
          accent === "danger"
            ? "bg-gradient-to-r from-destructive/10 via-destructive/5 to-transparent"
            : "bg-gradient-to-r from-primary/10 via-primary/5 to-transparent",
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 rounded-full",
              accent === "danger" ? "bg-destructive" : "bg-primary",
            )}
            aria-hidden
          />
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            {title}
          </h2>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
          {alerts.length}
        </span>
      </header>

      {alerts.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="w-[96px] px-3 py-2">Hora</th>
                <th className="min-w-[200px] px-3 py-2">Host</th>
                <th className="min-w-[300px] px-3 py-2">Problema</th>
                <th className="w-[150px] px-3 py-2">Severidade</th>
                <th className="w-[96px] px-3 py-2">Duração</th>
                <th className="w-[110px] px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => {
                const accentColor = getSeverityAccent(alert.severity);
                return (
                  <tr
                    key={alert.eventId}
                    className="group cursor-pointer border-b border-border/60 transition-colors last:border-b-0 hover:bg-muted/40"
                    onClick={() => onSelectAlert(alert)}
                    style={{ backgroundColor: getSeveritySoftBg(alert.severity) }}
                  >
                    <td className="px-3 py-2.5 align-middle">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-7 w-1 shrink-0 rounded-full"
                          style={{ backgroundColor: accentColor }}
                          aria-hidden
                        />
                        <span className="tabular-nums font-medium text-foreground">
                          {formatTimeOnly(alert.clock)}
                        </span>
                      </div>
                    </td>

                    <td className="max-w-[240px] truncate px-3 py-2.5 align-middle">
                      <button
                        type="button"
                        className="truncate text-left font-medium text-foreground transition-colors hover:text-primary"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectAlert(alert);
                        }}
                        title={alert.hostName ?? "—"}
                      >
                        {alert.hostName ?? "—"}
                      </button>
                    </td>

                    <td className="px-3 py-2.5 align-middle text-foreground/90">
                      <span className="line-clamp-2 leading-snug" title={alert.name}>
                        {alert.name}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 align-middle">
                      <span
                        className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                        style={severityBadgeStyle(alert.severity)}
                      >
                        {getZabbixSeverityLabel(alert.severity)}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-3 py-2.5 align-middle">
                      <span className="tabular-nums text-muted-foreground">
                        {formatConsoleDuration(alert.durationSeconds)}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 text-right align-middle">
                      {alert.acknowledged ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500">
                          <Check className="size-3.5" />
                          Reconhecido
                        </span>
                      ) : canAck && onAckAlert ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                          onClick={(event) => {
                            event.stopPropagation();
                            onAckAlert(alert);
                          }}
                        >
                          <MessageSquare className="size-3.5" />
                          Reconhecer
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
