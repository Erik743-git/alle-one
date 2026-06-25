import { ForbiddenException } from '@nestjs/common';
import { TenantScopeService } from './tenant-scope.service';
import type { AuthenticatedRequestUser } from '../../modules/auth/auth-request-user';

describe('TenantScopeService', () => {
  const prisma = {
    company: {
      findFirst: jest.fn(),
    },
  } as unknown as ConstructorParameters<typeof TenantScopeService>[0];

  const service = new TenantScopeService(prisma as never);

  const clientUser: AuthenticatedRequestUser = {
    userId: 'u1',
    role: 'CLIENT',
    companyId: 'c1',
    permissions: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('força client_ids da empresa para CLIENT', async () => {
    (prisma.company.findFirst as jest.Mock).mockResolvedValue({
      id: 'c1',
      tifluxClientId: 42,
      zabbixGroupName: 'ALLE - Cliente',
    });

    await expect(service.resolveTifluxClientIds(clientUser, undefined)).resolves.toEqual(
      [42],
    );
  });

  it('rejeita client_ids de outra empresa', async () => {
    (prisma.company.findFirst as jest.Mock).mockResolvedValue({
      id: 'c1',
      tifluxClientId: 42,
      zabbixGroupName: 'ALLE - Cliente',
    });

    await expect(
      service.resolveTifluxClientIds(clientUser, [99]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('valida grupo Zabbix do CLIENT', async () => {
    (prisma.company.findFirst as jest.Mock).mockResolvedValue({
      id: 'c1',
      tifluxClientId: 42,
      zabbixGroupName: 'ALLE - Cliente',
    });

    await expect(
      service.assertZabbixGroupAccess(clientUser, 'ALLE - Outro'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.assertZabbixGroupAccess(clientUser, 'ALLE - Cliente'),
    ).resolves.toBe('ALLE - Cliente');
  });

  it('aceita múltiplos grupos Zabbix separados por ponto e vírgula', async () => {
    (prisma.company.findFirst as jest.Mock).mockResolvedValue({
      id: 'c1',
      tifluxClientId: 42,
      zabbixGroupName: 'Grupo A;Grupo B',
    });

    await expect(
      service.assertZabbixGroupAccess(clientUser, 'Grupo B'),
    ).resolves.toBe('Grupo B');

    await expect(service.resolveZabbixGroupForList(clientUser)).resolves.toBe(
      'Grupo A;Grupo B',
    );
  });
});
