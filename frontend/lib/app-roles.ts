export type AppRole = "ADMIN" | "COLLABORATOR" | "PJ" | "CLIENT";

export function isCollaboratorRole(role?: string | null): boolean {
  return role === "COLLABORATOR";
}

export function isPjRole(role?: string | null): boolean {
  return role === "PJ";
}

/** Colaborador CLT + PJ: mesmo tipo de acesso interno (exceto Rendimento para PJ). */
export function isInternalStaffRole(role?: string | null): boolean {
  return role === "ADMIN" || role === "COLLABORATOR" || role === "PJ";
}

/** Quem aparece na agenda/lista de Rendimento. */
export function isRendimentoSubjectRole(role?: string | null): boolean {
  return role === "ADMIN" || role === "COLLABORATOR";
}

export function roleDisplayLabel(role?: string | null): string {
  switch (role) {
    case "ADMIN":
      return "Administrador";
    case "COLLABORATOR":
      return "Colaborador";
    case "PJ":
      return "PJ";
    case "CLIENT":
      return "Cliente";
    default:
      return "Usuário";
  }
}
