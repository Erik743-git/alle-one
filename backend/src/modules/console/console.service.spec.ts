import { BadRequestException } from '@nestjs/common';
import { ConsoleService } from './console.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import type { ZabbixService } from '../zabbix/zabbix.service';
import type { TenantScopeService } from '../../common/security/tenant-scope.service';

describe('ConsoleService', () => {
  const zabbix = {
    getConsoleAlertsForGroup: jest.fn(),
    getGroups: jest.fn(),
    acknowledgeEvents: jest.fn(),
  } as unknown as ZabbixService;

  const tenantScope = {
    resolveZabbixGroupForList: jest.fn(),
    assertZabbixGroupAccess: jest.fn(),
  } as unknown as TenantScopeService;

  const prisma = {
    company: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as import('../../prisma/prisma.service').PrismaService;

  const service = new ConsoleService(zabbix, tenantScope, prisma);

  const adminUser: AuthenticatedRequestUser = {
    userId: 'admin-1',
    email: 'admin@alle.com',
    role: 'ADMIN',
    companyId: null,
    permissions: [],
  };

  const clientUser: AuthenticatedRequestUser = {
    userId: 'client-1',
    email: 'client@empresa.com',
    role: 'CLIENT',
    companyId: 'company-1',
    permissions: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exige grupo para ADMIN na listagem de alertas', async () => {
    (tenantScope.resolveZabbixGroupForList as jest.Mock).mockResolvedValue(null);

    await expect(service.listAlerts(adminUser, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('CLIENT usa grupos da empresa quando group não é informado', async () => {
    (tenantScope.resolveZabbixGroupForList as jest.Mock).mockResolvedValue(
      'Grupo A;Grupo B',
    );
    (zabbix.getConsoleAlertsForGroup as jest.Mock).mockResolvedValue({
      group: 'Grupo A;Grupo B',
      alerts: [],
      priorityAlerts: [],
      fetchedAt: new Date().toISOString(),
    });

    await service.listAlerts(clientUser, {});

    expect(zabbix.getConsoleAlertsForGroup).toHaveBeenCalledWith(
      'Grupo A;Grupo B',
      expect.objectContaining({ acknowledged: 'all', limit: 500 }),
    );
  });

  it('CLIENT valida grupo selecionado antes de consultar alertas', async () => {
    (tenantScope.resolveZabbixGroupForList as jest.Mock).mockResolvedValue(
      'Grupo A;Grupo B',
    );
    (tenantScope.assertZabbixGroupAccess as jest.Mock).mockResolvedValue('Grupo B');
    (zabbix.getConsoleAlertsForGroup as jest.Mock).mockResolvedValue({
      group: 'Grupo B',
      alerts: [],
      priorityAlerts: [],
      fetchedAt: new Date().toISOString(),
    });

    await service.listAlerts(clientUser, { group: 'Grupo B' });

    expect(tenantScope.assertZabbixGroupAccess).toHaveBeenCalledWith(
      clientUser,
      'Grupo B',
    );
    expect(zabbix.getConsoleAlertsForGroup).toHaveBeenCalledWith(
      'Grupo B',
      expect.any(Object),
    );
  });

  it('listGroups retorna múltiplos grupos para CLIENT', async () => {
    (tenantScope.resolveZabbixGroupForList as jest.Mock).mockResolvedValue(
      'Grupo A;Grupo B',
    );

    await expect(service.listGroups(clientUser)).resolves.toEqual({
      groups: [
        { name: 'Grupo A', companyName: null, isPriority: false },
        { name: 'Grupo B', companyName: null, isPriority: false },
      ],
    });
    expect(zabbix.getGroups).not.toHaveBeenCalled();
  });

  it('listGroups consulta Zabbix para ADMIN', async () => {
    (tenantScope.resolveZabbixGroupForList as jest.Mock).mockResolvedValue(null);
    (zabbix.getGroups as jest.Mock).mockResolvedValue([
      { groupid: '1', name: 'Grupo X' },
    ]);

    await expect(service.listGroups(adminUser)).resolves.toEqual({
      groups: [
        {
          name: 'Grupo X',
          groupid: '1',
          companyName: null,
          isPriority: false,
        },
      ],
    });
  });

  it('acknowledge repassa evento ao Zabbix após validar escopo', async () => {
    (tenantScope.resolveZabbixGroupForList as jest.Mock).mockResolvedValue(
      'Grupo A',
    );
    (tenantScope.assertZabbixGroupAccess as jest.Mock).mockResolvedValue(
      'Grupo A',
    );
    (zabbix.getConsoleAlertsForGroup as jest.Mock).mockResolvedValue({
      alerts: [{ eventId: '99', name: 'Problema' }],
    });
    (zabbix.acknowledgeEvents as jest.Mock).mockResolvedValue({ eventids: ['99'] });

    await expect(
      service.acknowledgeAlert(clientUser, '99', {
        message: 'OK',
        group: 'Grupo A',
        close: true,
      }),
    ).resolves.toEqual({ ok: true, eventId: '99' });

    expect(zabbix.acknowledgeEvents).toHaveBeenCalledWith(
      ['99'],
      'OK',
      expect.objectContaining({ close: true, suppress: false }),
    );
  });
});
