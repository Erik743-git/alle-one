import type { UserRole } from '@prisma/client';

/** Papéis do portal do cliente (tenant). Inclui CLIENT legado. */
export const CLIENT_PORTAL_ROLES: ReadonlyArray<UserRole | string> = [
  'CLIENT',
  'CLIENT_GESTOR',
  'CLIENT_MEMBER',
];

export function isClientPortalRole(
  role: UserRole | string | null | undefined,
): boolean {
  return (
    role === 'CLIENT' || role === 'CLIENT_GESTOR' || role === 'CLIENT_MEMBER'
  );
}

/** Chefe / dono da empresa (vê dados da empresa inteira). */
export function isClientGestorRole(
  role: UserRole | string | null | undefined,
): boolean {
  return role === 'CLIENT' || role === 'CLIENT_GESTOR';
}

/** Funcionário: escopo “meus” tickets / permissões mais restritas. */
export function isClientMemberRole(
  role: UserRole | string | null | undefined,
): boolean {
  return role === 'CLIENT_MEMBER';
}
