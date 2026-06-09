/** Alinhado ao enum `PermissionModule` do Prisma / backend */
export type PermissionModuleKey =
  | "DASHBOARD"
  | "FINANCIAL"
  | "GMUD"
  | "REPORTS"
  | "ADMIN"
  | "COMPANIES"
  | "USERS"
  | "PERMISSIONS"
  | "CONTRACTS"
  | "MONITORING"
  | "TICKETS"
  | "DOCUMENTATION"
  | "PROJECTS"
  | "SLA"
  | "BILLING"
  | "RENDIMENTO"
  | "CORREIO"
  | "INVENTARIO";

export type ModulePermission = {
  module: PermissionModuleKey;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
};

export type PermissionFlag =
  | "canView"
  | "canCreate"
  | "canEdit"
  | "canDelete"
  | "canApprove";

/** Rótulos exibidos na matriz de permissões do admin (modal de usuário). */
export const PORTAL_PERMISSION_MODULES: Array<{
  key: PermissionModuleKey;
  label: string;
}> = [
  { key: "DASHBOARD", label: "Dashboard" },
  { key: "FINANCIAL", label: "Financeiro" },
  { key: "GMUD", label: "GMUD" },
  { key: "RENDIMENTO", label: "Apontamentos" },
  { key: "CORREIO", label: "Correio" },
  { key: "INVENTARIO", label: "Inventário" },
  { key: "ADMIN", label: "Administração" },
];
