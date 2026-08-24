import type { PermissionFlag, PermissionModuleKey } from "./permission-modules";
import {
  isClientGestorRole,
  isClientMemberRole,
  isClientPortalRole,
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
  return isClientPortalRole(getCurrentRole());
}

export function isClientGestor() {
  return isClientGestorRole(getCurrentRole());
}

export function isClientMember() {
  return isClientMemberRole(getCurrentRole());
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
  "PROJECTS",
  "RENDIMENTO",
];

const PJ_DEFAULT_VIEW: PermissionModuleKey[] = [
  "DASHBOARD",
  "GMUD",
  "CORREIO",
  "RENDIMENTO",
];

export function hasPermission(module: PermissionModuleKey, flag: PermissionFlag) {
  if (flag === "canView" && isClient()) {
    const clientMatrixModules: PermissionModuleKey[] = [
      "DASHBOARD",
      "FINANCIAL",
      "RENDIMENTO",
      "GMUD",
      "INVENTARIO",
      "PROJECTS",
      "TICKETS",
      "MONITORING",
    ];
    if (clientMatrixModules.includes(module)) {
      const entry = getModuleEntry(module);
      if (entry && entry.canView === false) return false;
      // Sem entrada: confia no effective do JWT (pack ∩ fallback).
      if (entry) return entry.canView === true;
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

export function canAccessAdmin() {
  return isAdmin() && canViewModule("ADMIN");
}

export function canAccessFinanceiro() {
  if (isClientMember()) return false;
  if (isClient()) {
    return canViewModule("FINANCIAL");
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
  return canViewModule("DASHBOARD");
}

/** Primeira rota acessível quando o usuário não tem o módulo atual. */
export function getDefaultAppRoute(): string {
  const candidates: Array<{ ok: boolean; path: string }> = [
    { ok: canViewModule("DASHBOARD"), path: "/dashboard" },
    { ok: canAccessTickets(), path: "/tickets" },
    { ok: canAccessGmud(), path: "/gmud" },
    { ok: canAccessFinanceiro(), path: "/financeiro" },
    { ok: canAccessInventario(), path: "/inventario" },
    { ok: canAccessProjetos(), path: "/projetos" },
    { ok: canAccessConsole(), path: "/console" },
    { ok: canAccessRendimento(), path: "/apontamentos" },
  ];
  return candidates.find((c) => c.ok)?.path ?? "/tickets";
}

export function canAccessRendimento() {
  if (isClientMember()) return false;
  if (isClient()) {
    return canViewModule("RENDIMENTO");
  }
  if (isPj()) return canViewModule("RENDIMENTO");
  return (isAdmin() || isCollaborator()) && canViewModule("RENDIMENTO");
}

export function canAccessTickets() {
  return canViewModule("TICKETS");
}

export {
  TICKETS_CREATE_RESTRICTED as TICKETS_CREATE_ADMIN_ONLY_MESSAGE,
  TICKETS_APPOINTMENT_CREATE_RESTRICTED,
} from "./module-copy";

/** Criar ticket: staff com canCreate, ou CLIENT_* com canCreate (pack). */
export function canCreateTicket() {
  if (isAdmin()) return hasPermission("TICKETS", "canCreate");
  if (isCollaborator() || isPj()) {
    return hasPermission("TICKETS", "canCreate");
  }
  if (isClient()) {
    return hasPermission("TICKETS", "canCreate");
  }
  return false;
}

/** Apontamento: staff only no MVP (cliente cria ticket, não aponta ainda). */
export function canCreateTicketAppointment() {
  if (isClient()) return false;
  return canCreateTicket();
}

export function canChangeTicketStage() {
  return canCreateTicketAppointment();
}

export function canCreateTicketsAndAppointments() {
  return canCreateTicket();
}

export function canCreateVoluntaryRendimentoJustification() {
  if (isPj()) return false;
  if (isAdmin()) return true;
  if (!isCollaborator()) return false;
  return canViewModule("RENDIMENTO");
}

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
  if (isClientMember()) return false;
  if (isClient()) {
    return canViewModule("INVENTARIO");
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

export function canAccessProjetos() {
  if (isPj()) return canViewModule("PROJECTS");
  if (isClientMember()) return false;
  if (isClient()) {
    return canViewModule("PROJECTS");
  }
  return canViewModule("PROJECTS");
}

export function canAccessConsole() {
  return canViewModule("MONITORING");
}

export function canAcknowledgeConsoleAlerts() {
  return hasPermission("MONITORING", "canEdit");
}

export function canEditProjetos() {
  if (isClient() || isPj()) return false;
  if (isAdmin()) return true;
  return hasPermission("PROJECTS", "canEdit");
}

export function canImportProjetos() {
  return canEditProjetos();
}

export function canAccessAplicativos() {
  const role = getCurrentRole();
  return isInternalStaffRole(role) || isClientPortalRole(role);
}
