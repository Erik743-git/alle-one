import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import type { TenantScopeService } from '../../common/security/tenant-scope.service';

/** CLIENT só acessa tickets do cliente TiFlux da própria empresa. */
export async function assertTicketClientScope(
  tenantScope: TenantScopeService,
  actor: AuthenticatedRequestUser,
  clientExternalId: number | null | undefined,
): Promise<void> {
  if (actor.role !== 'CLIENT') {
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
  mineOnlyForcedOff: boolean;
}> {
  if (actor.role !== 'CLIENT') {
    return {
      clientExternalId: requestedClientId ?? null,
      mineOnlyForcedOff: false,
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
  return { clientExternalId: allowed, mineOnlyForcedOff: true };
}
