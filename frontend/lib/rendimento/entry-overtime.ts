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
  if (upper.includes("PLANT")) return "PLANTAO";
  if (upper.includes("HORA EXTRA") || upper.includes("HORAS EXTRA")) return "EXTRA";
  return null;
}

/** Classificação única para UI: prioriza tipo TiFlux, depois overtimeKind da API. */
export function resolveRendimentoOvertimeDisplay(
  entry: Pick<
    RendimentoEntry,
    "overtimeKind" | "isOvertime" | "valorizationServiceName" | "clientName" | "description"
  >,
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

  const hay = `${entry.clientName ?? ""} ${entry.description ?? ""}`.toLowerCase();
  if (hay.includes("plantao") || hay.includes("plantão")) {
    return { kind: "PLANTAO", label: "PLANTÃO", serviceName };
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
