import type { PermissionFlag, PermissionModuleKey } from "./permission-modules";
import { getStoredUser } from "./session";

export type AppRole = "ADMIN" | "COLLABORATOR" | "CLIENT";

export function getCurrentRole(): AppRole | null {
  const user = getStoredUser();
  return user?.role ?? null;
}

export function isAdmin() {
  return getCurrentRole() === "ADMIN";
}

export function isCollaborator() {
  return getCurrentRole() === "COLLABORATOR";
}

export function isClient() {
  return getCurrentRole() === "CLIENT";
}

function getModuleEntry(module: PermissionModuleKey) {
  const user = getStoredUser();
  if (!user?.permissions?.length) {
    return null;
  }
  if (user.role === "ADMIN") {
    return {
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canApprove: true,
    };
  }
  return user.permissions.find((p) => p.module === module) ?? null;
}

export function hasPermission(module: PermissionModuleKey, flag: PermissionFlag) {
  // Para CLIENT: permitir ver o dashboard mesmo quando `permissions` vier vazio.
  if (flag === "canView" && module === "DASHBOARD" && isClient()) {
    return true;
  }
  const entry = getModuleEntry(module);
  return entry?.[flag] === true;
}

export function canViewModule(module: PermissionModuleKey) {
  return hasPermission(module, "canView");
}

/** Navegação: Administração exige papel ADMIN (e módulo ADMIN na matriz). */
export function canAccessAdmin() {
  return isAdmin() && canViewModule("ADMIN");
}

export function canAccessFinanceiro() {
  return canViewModule("FINANCIAL");
}

export function canAccessGmud() {
  return canViewModule("GMUD");
}

export function canAccessRelatorios() {
  return canViewModule("REPORTS");
}

export function canAccessDashboard() {
  // Cliente sempre pode ver o dashboard da própria empresa (mesmo sem matriz preenchida)
  return isClient() || canViewModule("DASHBOARD");
}

export function canAccessRendimento() {
  return (
    (isAdmin() || isCollaborator()) && canViewModule("RENDIMENTO")
  );
}

export function canAccessAplicativos() {
  const role = getCurrentRole();
  return (
    role === "ADMIN" ||
    role === "COLLABORATOR" ||
    role === "CLIENT"
  );
}
