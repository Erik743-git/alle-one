import { ForbiddenException } from '@nestjs/common';
import {
  assertTicketClientScope,
  resolveClientListFilter,
} from './tickets-client-scope';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import type { TenantScopeService } from '../../common/security/tenant-scope.service';

describe('tickets-client-scope', () => {
  const tenantScope = {
    resolveTifluxClientIds: jest.fn(),
  } as unknown as TenantScopeService;

  const clientActor = {
    userId: 'u1',
    role: 'CLIENT',
    companyId: 'c1',
  } as AuthenticatedRequestUser;

  const adminActor = {
    userId: 'a1',
    role: 'ADMIN',
    companyId: null,
  } as AuthenticatedRequestUser;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('assertTicketClientScope', () => {
    it('libera ADMIN sem consultar tenant', async () => {
      await assertTicketClientScope(tenantScope, adminActor, 99);
      expect(tenantScope.resolveTifluxClientIds).not.toHaveBeenCalled();
    });

    it('libera CLIENT no cliente da própria empresa', async () => {
      (tenantScope.resolveTifluxClientIds as jest.Mock).mockResolvedValue([42]);
      await expect(
        assertTicketClientScope(tenantScope, clientActor, 42),
      ).resolves.toBeUndefined();
    });

    it('bloqueia CLIENT fora do escopo', async () => {
      (tenantScope.resolveTifluxClientIds as jest.Mock).mockResolvedValue([42]);
      await expect(
        assertTicketClientScope(tenantScope, clientActor, 99),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('bloqueia CLIENT sem clientExternalId no ticket', async () => {
      (tenantScope.resolveTifluxClientIds as jest.Mock).mockResolvedValue([42]);
      await expect(
        assertTicketClientScope(tenantScope, clientActor, null),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('resolveClientListFilter', () => {
    it('ADMIN respeita filtro opcional', async () => {
      await expect(
        resolveClientListFilter(tenantScope, adminActor, 7),
      ).resolves.toEqual({
        clientExternalId: 7,
        mineOnlyForcedOff: false,
      });
    });

    it('CLIENT força o cliente da empresa', async () => {
      (tenantScope.resolveTifluxClientIds as jest.Mock).mockResolvedValue([42]);
      await expect(
        resolveClientListFilter(tenantScope, clientActor, undefined),
      ).resolves.toEqual({
        clientExternalId: 42,
        mineOnlyForcedOff: true,
      });
    });

    it('CLIENT não pode pedir outro client_id', async () => {
      (tenantScope.resolveTifluxClientIds as jest.Mock).mockResolvedValue([42]);
      await expect(
        resolveClientListFilter(tenantScope, clientActor, 99),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
