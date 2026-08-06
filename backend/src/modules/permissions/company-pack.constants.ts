import type { PermissionModule, UserRole } from '@prisma/client';

/**
 * Módulos que podem entrar no pack vendido por empresa.
 * (ADMIN/USERS/PERMISSIONS etc. ficam só para staff Alle.)
 */
export const COMPANY_PACK_MODULES: PermissionModule[] = [
  'DASHBOARD',
  'FINANCIAL',
  'GMUD',
  'MONITORING',
  'TICKETS',
  'INVENTARIO',
  'PROJECTS',
  'RENDIMENTO',
  'REPORTS',
  'CONTRACTS',
];

export const DEFAULT_COMPANY_PACK_MODULES: PermissionModule[] = [
  'DASHBOARD',
  'FINANCIAL',
  'GMUD',
  'MONITORING',
  'TICKETS',
  'INVENTARIO',
  'PROJECTS',
  'RENDIMENTO',
];

export function isStaffRole(role: UserRole | string): boolean {
  return role === 'ADMIN' || role === 'COLLABORATOR' || role === 'PJ';
}
