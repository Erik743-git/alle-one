import type { RendimentoEntry } from "@/lib/services/rendimento.service";

export type RendimentoOvertimeKind = "EXTRA" | "PLANTAO";

export type RendimentoOvertimeDisplay = {
  kind: RendimentoOvertimeKind | null;
  label: string;
  serviceName: string | null;
};

function normalizeServiceName(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function kindFromServiceName(serviceName: string | null): RendimentoOvertimeKind | null {
  if (!serviceName) return null;
  const upper = serviceName.toUpperCase();
  if (upper.includes("PLANTAO") || upper.includes("PLANTÃO")) return "PLANTAO";
  if (upper.includes("HORA EXTRA") || upper.includes("HORAS EXTRA")) return "EXTRA";
  if (upper.includes("HORA NORMAL")) return null;
  return null;
}

export type RendimentoOvertimeEntryInput = Pick<
  RendimentoEntry,
  "overtimeKind" | "isOvertime" | "valorizationServiceName"
> & {
  clientName?: string | null;
  description?: string | null;
};

/** Classificação única para UI: prioriza tipo do serviço, depois overtimeKind da API. */
export function resolveRendimentoOvertimeDisplay(
  entry: RendimentoOvertimeEntryInput,
): RendimentoOvertimeDisplay {
  const serviceName = normalizeServiceName(entry.valorizationServiceName);
  const fromService = kindFromServiceName(serviceName);

  if (fromService === "PLANTAO") {
    return { kind: "PLANTAO", label: "PLANTÃO", serviceName };
  }
  if (fromService === "EXTRA") {
    return { kind: "EXTRA", label: "HORA EXTRA", serviceName };
  }

  if (entry.overtimeKind === "PLANTAO") {
    return { kind: "PLANTAO", label: "PLANTÃO", serviceName };
  }
  if (entry.overtimeKind === "EXTRA") {
    return { kind: "EXTRA", label: "HORA EXTRA", serviceName };
  }

  if (entry.isOvertime) {
    return { kind: "EXTRA", label: "HORA EXTRA", serviceName };
  }

  return { kind: null, label: "", serviceName };
}

export function rendimentoOvertimeCardClass(kind: RendimentoOvertimeKind | null): string {
  if (kind === "PLANTAO") {
    return "border-l-4 border-l-violet-500 border-violet-500/40 bg-violet-500/10";
  }
  if (kind === "EXTRA") {
    return "border-l-4 border-l-amber-500 border-amber-500/50 bg-amber-500/10";
  }
  return "border-border bg-muted/20";
}
