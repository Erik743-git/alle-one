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
  | "BILLING";

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
