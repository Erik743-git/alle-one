"use client";

import { Clock, Shield } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  resolveRendimentoOvertimeDisplay,
  type RendimentoOvertimeDisplay,
  type RendimentoOvertimeEntryInput,
} from "@/lib/rendimento/entry-overtime";
export function useRendimentoOvertimeDisplay(
  entry: RendimentoOvertimeEntryInput,
): RendimentoOvertimeDisplay {
  return resolveRendimentoOvertimeDisplay(entry);
}

export function RendimentoOvertimeBadge({
  entry,
  size = "md",
}: {
  entry: RendimentoOvertimeEntryInput;
  size?: "sm" | "md";
}) {
  const display = resolveRendimentoOvertimeDisplay(entry);
  if (!display.kind) return null;

  const isPlantao = display.kind === "PLANTAO";
  const Icon = isPlantao ? Shield : Clock;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wide text-white",
        size === "sm" ? "px-1.5 py-0.5 text-[8px]" : "px-2 py-0.5 text-[10px]",
        isPlantao ? "bg-violet-700 ring-1 ring-violet-300/60" : "bg-amber-600",
      )}
      title={display.serviceName ? `Serviço: ${display.serviceName}` : display.label}
    >
      <Icon className={size === "sm" ? "size-2.5" : "size-3"} aria-hidden />
      {display.label}
    </span>
  );
}

export function RendimentoOvertimeServiceLine({
  entry,
}: {
  entry: RendimentoOvertimeEntryInput;
}) {
  const display = resolveRendimentoOvertimeDisplay(entry);
  if (!display.serviceName || !display.kind) return null;

  return (
    <p
      className={cn(
        "mt-1 text-xs font-medium",
        display.kind === "PLANTAO" ? "text-violet-700 dark:text-violet-300" : "text-amber-800 dark:text-amber-200",
      )}
    >
      Tipo de serviço: {display.serviceName}
    </p>
  );
}
