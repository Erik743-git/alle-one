export type AppRole =
  | "ADMIN"
  | "COLLABORATOR"
  | "PJ"
  | "CLIENT"
  | "CLIENT_GESTOR"
  | "CLIENT_MEMBER";

export function isCollaboratorRole(role?: string | null): boolean {
  return role === "COLLABORATOR";
}

export function isPjRole(role?: string | null): boolean {
  return role === "PJ";
}

/** Colaborador CLT + PJ: acesso interno ao portal. */
export function isInternalStaffRole(role?: string | null): boolean {
  return role === "ADMIN" || role === "COLLABORATOR" || role === "PJ";
}

/** Portal do cliente (tenant), inclui CLIENT legado. */
export function isClientPortalRole(role?: string | null): boolean {
  return (
    role === "CLIENT" ||
    role === "CLIENT_GESTOR" ||
    role === "CLIENT_MEMBER"
  );
}

export function isClientGestorRole(role?: string | null): boolean {
  return role === "CLIENT" || role === "CLIENT_GESTOR";
}

export function isClientMemberRole(role?: string | null): boolean {
  return role === "CLIENT_MEMBER";
}

/** Quem pode ter agenda própria em Apontamentos (admin lista só CLT). */
export function isRendimentoSubjectRole(role?: string | null): boolean {
  return role === "ADMIN" || role === "COLLABORATOR" || role === "PJ";
}

export function roleDisplayLabel(role?: string | null): string {
  switch (role) {
    case "ADMIN":
      return "Administrador";
    case "COLLABORATOR":
      return "Colaborador";
    case "PJ":
      return "Terceiro";
    case "CLIENT":
    case "CLIENT_GESTOR":
      return "Cliente (gestor)";
    case "CLIENT_MEMBER":
      return "Cliente (funcionário)";
    default:
      return "Usuário";
  }
}
