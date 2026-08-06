import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import type { TenantScopeService } from '../../common/security/tenant-scope.service';
import {
  isClientGestorRole,
  isClientMemberRole,
  isClientPortalRole,
} from '../../common/security/client-portal-role';

/** CLIENT_* só acessa tickets do cliente TiFlux da própria empresa. */
export async function assertTicketClientScope(
  tenantScope: TenantScopeService,
  actor: AuthenticatedRequestUser,
  clientExternalId: number | null | undefined,
): Promise<void> {
  if (!isClientPortalRole(actor.role)) {
    return;
  }
  const allowedIds = await tenantScope.resolveTifluxClientIds(actor);
  const allowed = allowedIds?.[0];
  if (
    allowed == null ||
    clientExternalId == null ||
    Number(clientExternalId) !== Number(allowed)
  ) {
    throw new ForbiddenException('Ticket fora do escopo da sua empresa.');
  }
}

export async function resolveClientListFilter(
  tenantScope: TenantScopeService,
  actor: AuthenticatedRequestUser,
  requestedClientId: number | null | undefined,
): Promise<{
  clientExternalId: number | null;
  /** Gestor: força ver todos da empresa. Member: força “meus”. */
  mineOnlyForcedOff: boolean;
  mineOnlyForcedOn: boolean;
}> {
  if (!isClientPortalRole(actor.role)) {
    return {
      clientExternalId: requestedClientId ?? null,
      mineOnlyForcedOff: false,
      mineOnlyForcedOn: false,
    };
  }
  const allowedIds = await tenantScope.resolveTifluxClientIds(actor);
  const allowed = allowedIds?.[0] ?? null;
  if (allowed == null) {
    throw new ForbiddenException('Empresa sem cliente TiFlux configurado');
  }
  if (
    requestedClientId != null &&
    Number(requestedClientId) !== Number(allowed)
  ) {
    throw new ForbiddenException('client_ids não permitido para a sua empresa');
  }

  if (isClientMemberRole(actor.role)) {
    return {
      clientExternalId: allowed,
      mineOnlyForcedOff: false,
      mineOnlyForcedOn: true,
    };
  }

  // CLIENT legado + CLIENT_GESTOR
  if (isClientGestorRole(actor.role)) {
    return {
      clientExternalId: allowed,
      mineOnlyForcedOff: true,
      mineOnlyForcedOn: false,
    };
  }

  return {
    clientExternalId: allowed,
    mineOnlyForcedOff: true,
    mineOnlyForcedOn: false,
  };
}
