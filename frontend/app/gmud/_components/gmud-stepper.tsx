"use client";

import { cn } from "@/lib/utils";
import type { GmudStatus } from "@/lib/services/gmuds.service";

const STEPS = [
  { key: "CREATION", label: "Criação" },
  { key: "APPROVAL", label: "Aprovação" },
  { key: "EXECUTION", label: "Execução" },
] as const;

function getActiveStepIndex(status: GmudStatus) {
  switch (status) {
    case "DRAFT":
    case "PENDING_APPROVAL":
    case "REJECTED":
    case "CANCELED":
      return 0;
    case "APPROVED":
      return 1;
    case "IN_EXECUTION":
    case "EXECUTED":
      return 2;
    default:
      return 0;
  }
}

export function GmudStepper({ status }: { status: GmudStatus }) {
  const activeIndex = getActiveStepIndex(status);
  const progressPct = (activeIndex / (STEPS.length - 1)) * 100;

  const posStyle = (idx: number) => {
    if (idx === 0) return { left: "0%", transform: "translateX(0%)" as const };
    if (idx === STEPS.length - 1)
      return { left: "100%", transform: "translateX(-100%)" as const };
    return {
      left: `${(idx / (STEPS.length - 1)) * 100}%`,
      transform: "translateX(-50%)" as const,
    };
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 text-card-foreground">
      <div className="relative">
        <div className="relative h-10">
          {/* trilho */}
          <div className="absolute left-0 right-0 top-4 h-[3px] rounded-full bg-border" />
          {/* brilho sutil ao fundo */}
          <div className="absolute left-0 right-0 top-4 h-[3px] rounded-full bg-primary/10 blur-[2px]" />
          {/* progresso */}
          <div
            className="absolute left-0 top-4 h-[3px] rounded-full bg-gradient-to-r from-primary/40 via-primary to-primary shadow-[0_0_18px_rgba(18,181,217,0.25)]"
            style={{ width: `${progressPct}%` }}
          />

          {STEPS.map((step, idx) => {
            const isDone = idx < activeIndex;
            const isActive = idx === activeIndex;
            return (
              <div key={step.key} className="absolute top-0" style={posStyle(idx)}>
                <div
                  className={cn(
                    "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border",
                    "backdrop-blur-sm",
                    isDone && "border-emerald-400/30 bg-emerald-500/10",
                    isActive &&
                      "border-primary/40 bg-primary/10 shadow-[0_0_22px_rgba(18,181,217,0.22)]",
                    !isDone && !isActive && "border-border bg-muted/40"
                  )}
                >
                  <div
                    className={cn(
                      "h-2.5 w-2.5 rounded-full",
                      isDone && "bg-emerald-400/80",
                      isActive && "bg-primary",
                      !isDone && !isActive && "bg-muted-foreground/60"
                    )}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3">
          {STEPS.map((step, idx) => {
            const isDone = idx < activeIndex;
            const isActive = idx === activeIndex;
            return (
              <div
                key={step.key}
                className={cn(
                  "min-w-0",
                  idx === 0 && "text-left",
                  idx === 1 && "text-center",
                  idx === 2 && "text-right"
                )}
              >
                <div
                  className={cn(
                    "truncate text-sm font-semibold",
                    isActive && "text-foreground",
                    isDone && "text-emerald-700 dark:text-emerald-200",
                    !isDone && !isActive && "text-muted-foreground"
                  )}
                >
                  {step.label}
                </div>
                <div className="text-xs text-muted-foreground">
                  {isDone ? "Concluída" : isActive ? "Em andamento" : "Bloqueada"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

