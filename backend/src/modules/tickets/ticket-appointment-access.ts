import { ForbiddenException } from '@nestjs/common';
import { PermissionModule } from '@prisma/client';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { isClientPortalRole } from '../../common/security/client-portal-role';

export function hasTicketsEditPermission(
  actor: AuthenticatedRequestUser,
): boolean {
  if (actor.role === 'ADMIN') return true;
  return Boolean(
    actor.permissions.find((p) => p.module === PermissionModule.TICKETS)
      ?.canEdit,
  );
}

/**
 * Autor, admin ou gestor interno (TICKETS canEdit).
 * Cliente (inclusive gestor) só mexe no próprio apontamento — nunca no da
 * equipe da Alle.
 */
export function canManagePortalAppointment(
  actor: AuthenticatedRequestUser,
  createdBy: string,
): boolean {
  if (actor.role === 'ADMIN') return true;
  if (createdBy === actor.userId) return true;
  if (isClientPortalRole(actor.role)) return false;
  return hasTicketsEditPermission(actor);
}

export function assertCanManagePortalAppointment(
  actor: AuthenticatedRequestUser,
  createdBy: string,
): void {
  if (!canManagePortalAppointment(actor, createdBy)) {
    throw new ForbiddenException(
      'Sem permissão para alterar o apontamento de outro usuário.',
    );
  }
}
