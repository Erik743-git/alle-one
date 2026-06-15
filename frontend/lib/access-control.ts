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
  "RENDIMENTO",
];

export function hasPermission(module: PermissionModuleKey, flag: PermissionFlag) {
  // Para CLIENT: permitir ver o dashboard mesmo quando `permissions` vier vazio.
  if (flag === "canView" && module === "DASHBOARD" && isClient()) {
    return true;
  }

  // CLIENT: módulos com fallback no backend; matriz explícita pode revogar.
  if (flag === "canView" && isClient()) {
    const clientMatrixModules: PermissionModuleKey[] = [
      "FINANCIAL",
      "RENDIMENTO",
      "GMUD",
      "INVENTARIO",
    ];
    if (clientMatrixModules.includes(module)) {
      const entry = getModuleEntry(module);
      if (entry && entry.canView === false) return false;
      if (
        module === "FINANCIAL" ||
        module === "RENDIMENTO" ||
        module === "INVENTARIO"
      ) {
        return true;
      }
    }
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
  if (isClient()) {
    const entry = getModuleEntry("FINANCIAL");
    if (entry && entry.canView === false) return false;
    return true;
  }
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
  if (isClient()) {
    const entry = getModuleEntry("RENDIMENTO");
    if (entry && entry.canView === false) return false;
    return true;
  }
  if (isPj()) return canViewModule("RENDIMENTO");
  return (isAdmin() || isCollaborator()) && canViewModule("RENDIMENTO");
}

export function canAccessTickets() {
  return canViewModule("TICKETS");
}

/** Mensagem exibida quando não-admin tenta criar ticket ou apontamento. */
export {
  TICKETS_CREATE_RESTRICTED as TICKETS_CREATE_ADMIN_ONLY_MESSAGE,
  TICKETS_APPOINTMENT_CREATE_RESTRICTED,
} from "./module-copy";

/** V2 Tickets: criar ticket no portal — somente ADMIN. */
export function canCreateTicket() {
  return isAdmin() && hasPermission("TICKETS", "canCreate");
}

/** Apontamento no ticket: ADMIN ou colaborador/PJ com canCreate em TICKETS. */
export function canCreateTicketAppointment() {
  if (isAdmin()) return hasPermission("TICKETS", "canCreate");
  if (isCollaborator() || isPj()) {
    return hasPermission("TICKETS", "canCreate");
  }
  return false;
}

/** @deprecated Use canCreateTicket ou canCreateTicketAppointment */
export function canCreateTicketsAndAppointments() {
  return canCreateTicket();
}

/** Colaborador pode registrar justificativa voluntária na própria agenda (canView basta). */
export function canCreateVoluntaryRendimentoJustification() {
  if (isPj()) return false;
  if (isAdmin()) return true;
  if (!isCollaborator()) return false;
  return canViewModule("RENDIMENTO");
}

/** Colaborador pode justificar lacuna de tempo na própria agenda (canView basta). */
export function canCreateAlertRendimentoJustification() {
  return canCreateVoluntaryRendimentoJustification();
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
  if (isClient()) {
    const entry = getModuleEntry("INVENTARIO");
    if (entry && entry.canView === false) return false;
    return true;
  }
  return canViewModule("INVENTARIO");
}

export function canEditInventario() {
  if (isClient() || isPj()) return false;
  if (isAdmin()) return true;
  return hasPermission("INVENTARIO", "canEdit");
}

export function canDeleteInventario() {
  if (isClient() || isPj()) return false;
  if (isAdmin()) return true;
  return hasPermission("INVENTARIO", "canDelete");
}

export function canAccessAplicativos() {
  const role = getCurrentRole();
  return isInternalStaffRole(role) || role === "CLIENT";
}
