import type { AuthUser } from "@/lib/session";
import type { TicketStageGroupKey, TicketStageOption } from "@/lib/services/tickets.service";

function normalizeStageKey(stageName: string | null | undefined): string {
  return String(stageName ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

export function resolveTicketStageGroup(
  stageName: string | null | undefined,
): TicketStageGroupKey {
  const normalized = normalizeStageKey(stageName);
  if (!normalized) return "outros";

  if (
    normalized === "novo" ||
    normalized.includes("pendente") ||
    normalized === "pending" ||
    normalized === "aberto"
  ) {
    return "novo";
  }

  if (
    normalized.includes("atend") ||
    normalized.includes("execuc") ||
    normalized.includes("execut") ||
    normalized.includes("in progress") ||
    normalized === "progress" ||
    /^em execu/.test(normalized)
  ) {
    return "atendimento";
  }

  if (normalized.includes("aguardando") || normalized.includes("waiting")) {
    return "aguardando";
  }

  if (normalized.includes("resolv")) return "resolvido";

  if (
    normalized.includes("encerr") ||
    normalized.includes("fechad") ||
    normalized.includes("cancel")
  ) {
    return "encerrado";
  }

  return "outros";
}

export function isTicketNotStartedStage(
  stageName: string | null | undefined,
): boolean {
  return resolveTicketStageGroup(stageName) === "novo";
}

export function isNocSpecialtyUser(
  user: Pick<AuthUser, "specialtyName"> | null | undefined,
): boolean {
  const normalized = String(user?.specialtyName ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return normalized.includes("noc");
}

export function canAppointmentOnTicketStage(params: {
  stageName: string | null | undefined;
  user: Pick<AuthUser, "specialtyName"> | null | undefined;
}): boolean {
  if (!isTicketNotStartedStage(params.stageName)) {
    return true;
  }
  return isNocSpecialtyUser(params.user);
}

export function findExecutionStageOption(
  stages: TicketStageOption[],
): TicketStageOption | null {
  return (
    stages.find((stage) => resolveTicketStageGroup(stage.name) === "atendimento") ??
    null
  );
}
