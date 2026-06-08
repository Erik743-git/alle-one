import type { PermissionFlag, PermissionModuleKey } from "./permission-modules";
import {
  isCollaboratorRole,
  isInternalStaffRole,
  isPjRole,
  type AppRole,
} from "./app-roles";
import { getStoredUser } from "./session";

export type { AppRole };

export function getCurrentRole(): AppRole | null {
  const user = getStoredUser();
  return user?.role ?? null;
}

export function isAdmin() {
  return getCurrentRole() === "ADMIN";
}

export function isCollaborator() {
  return isCollaboratorRole(getCurrentRole());
}

export function isPj() {
  return isPjRole(getCurrentRole());
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

const COLLABORATOR_DEFAULT_VIEW: PermissionModuleKey[] = [
  "DASHBOARD",
  "GMUD",
  "CORREIO",
  "INVENTARIO",
  "RENDIMENTO",
];

const PJ_DEFAULT_VIEW: PermissionModuleKey[] = [
  "DASHBOARD",
  "GMUD",
  "CORREIO",
];

export function hasPermission(module: PermissionModuleKey, flag: PermissionFlag) {
  // Para CLIENT: permitir ver o dashboard mesmo quando `permissions` vier vazio.
  if (flag === "canView" && module === "DASHBOARD" && isClient()) {
    return true;
  }

  const user = getStoredUser();
  if (flag === "canView" && user && isCollaboratorRole(user.role)) {
    const lacksExplicit =
      !user.permissions?.length ||
      !user.permissions.some((p) => p.module === module);
    if (lacksExplicit) {
      return COLLABORATOR_DEFAULT_VIEW.includes(module);
    }
  }

  if (flag === "canView" && user && isPjRole(user.role)) {
    const lacksExplicit =
      !user.permissions?.length ||
      !user.permissions.some((p) => p.module === module);
    if (lacksExplicit) {
      return PJ_DEFAULT_VIEW.includes(module);
    }
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
  return isAdmin();
}

export function canAccessDashboard() {
  // Cliente sempre pode ver o dashboard da própria empresa (mesmo sem matriz preenchida)
  return isClient() || canViewModule("DASHBOARD");
}

export function canAccessRendimento() {
  if (isPj()) return false;
  return (isAdmin() || isCollaborator()) && canViewModule("RENDIMENTO");
}

/** Colaborador pode registrar justificativa voluntária na própria agenda (canView basta). */
export function canCreateVoluntaryRendimentoJustification() {
  if (isAdmin()) return true;
  if (!isCollaborator()) return false;
  return canViewModule("RENDIMENTO");
}

export function canAccessCorreio() {
  if (isClient()) return false;
  return (
    isAdmin() ||
    isCollaborator() ||
    isPj() ||
    canViewModule("CORREIO")
  );
}

export function canAccessInventario() {
  if (isPj()) return false;
  if (isClient()) return true;
  return isAdmin() || isCollaborator() || canViewModule("INVENTARIO");
}

export function canEditInventario() {
  if (isClient() || isPj()) return false;
  if (isAdmin()) return true;
  if (hasPermission("INVENTARIO", "canEdit")) return true;
  return isCollaborator() && canAccessInventario();
}

export function canDeleteInventario() {
  if (isClient() || isPj()) return false;
  if (isAdmin()) return true;
  if (hasPermission("INVENTARIO", "canDelete")) return true;
  return isCollaborator() && canAccessInventario();
}

export function canAccessAplicativos() {
  const role = getCurrentRole();
  return isInternalStaffRole(role) || role === "CLIENT";
}
