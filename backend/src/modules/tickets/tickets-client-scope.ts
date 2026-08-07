import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import type { TenantScopeService } from '../../common/security/tenant-scope.service';
import {
  isClientGestorRole,
  isClientMemberRole,
  isClientPortalRole,
} from '../../common/security/client-portal-role';

function normalizeEmail(email: string | null | undefined): string {
  return String(email ?? '')
    .trim()
    .toLowerCase();
}

/** CLIENT_* acessa tickets do cliente da própria empresa (e Alle se envolvido). */
export async function assertTicketClientScope(
  tenantScope: TenantScopeService,
  actor: AuthenticatedRequestUser,
  clientExternalId: number | null | undefined,
  involvement?: {
    createdBy?: string | null;
    requestorEmail?: string | null;
  },
): Promise<void> {
  if (!isClientPortalRole(actor.role)) {
    return;
  }
  const allowedIds = await tenantScope.resolveTifluxClientIds(actor);
  const ownId = allowedIds?.[0];
  if (
    ownId != null &&
    clientExternalId != null &&
    Number(clientExternalId) === Number(ownId)
  ) {
    return;
  }

  const alleId = await tenantScope.resolveAlleTifluxClientId();
  if (
    alleId != null &&
    clientExternalId != null &&
    Number(clientExternalId) === Number(alleId)
  ) {
    const createdBy = involvement?.createdBy?.trim() || null;
    const requestorEmail = normalizeEmail(involvement?.requestorEmail);
    const actorEmail = normalizeEmail(actor.email);
    if (createdBy && createdBy === actor.userId) {
      return;
    }
    if (requestorEmail && actorEmail && requestorEmail === actorEmail) {
      return;
    }
  }

  throw new ForbiddenException('Ticket fora do escopo da sua empresa.');
}

/** Na criação, CLIENT_* pode abrir para a própria empresa ou para Alle. */
export async function assertTicketCreateClientScope(
  tenantScope: TenantScopeService,
  actor: AuthenticatedRequestUser,
  clientExternalId: number | null | undefined,
): Promise<void> {
  if (!isClientPortalRole(actor.role)) {
    return;
  }
  const allowedIds =
    await tenantScope.resolveTifluxClientIdsForTicketCreate(actor);
  const allowed = new Set((allowedIds ?? []).map(Number));
  if (
    clientExternalId == null ||
    !Number.isFinite(Number(clientExternalId)) ||
    !allowed.has(Number(clientExternalId))
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
  /** Alle — listagem inclui só tickets Alle abertos pelo tenant do cliente. */
  alleClientExternalId: number | null;
  /** Gestor: força ver todos da empresa. Member: força “meus”. */
  mineOnlyForcedOff: boolean;
  mineOnlyForcedOn: boolean;
}> {
  if (!isClientPortalRole(actor.role)) {
    return {
      clientExternalId: requestedClientId ?? null,
      alleClientExternalId: null,
      mineOnlyForcedOff: false,
      mineOnlyForcedOn: false,
    };
  }
  const allowedIds = await tenantScope.resolveTifluxClientIds(actor);
  const allowed = allowedIds?.[0] ?? null;
  const alleClientExternalId = await tenantScope.resolveAlleTifluxClientId();
  if (allowed == null) {
    throw new ForbiddenException('Empresa sem cliente vinculado configurado');
  }
  if (
    requestedClientId != null &&
    Number(requestedClientId) !== Number(allowed) &&
    (alleClientExternalId == null ||
      Number(requestedClientId) !== Number(alleClientExternalId))
  ) {
    throw new ForbiddenException('client_ids não permitido para a sua empresa');
  }

  if (isClientMemberRole(actor.role)) {
    return {
      clientExternalId: allowed,
      alleClientExternalId,
      mineOnlyForcedOff: false,
      mineOnlyForcedOn: true,
    };
  }

  // CLIENT legado + CLIENT_GESTOR
  if (isClientGestorRole(actor.role)) {
    return {
      clientExternalId: allowed,
      alleClientExternalId,
      mineOnlyForcedOff: true,
      mineOnlyForcedOn: false,
    };
  }

  return {
    clientExternalId: allowed,
    alleClientExternalId,
    mineOnlyForcedOff: true,
    mineOnlyForcedOn: false,
  };
}
