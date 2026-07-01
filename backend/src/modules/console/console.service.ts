import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { TenantScopeService } from '../../common/security/tenant-scope.service';
import { PrismaService } from '../../prisma/prisma.service';
import { parseZabbixGroupNames } from '../companies/zabbix-groups.util';
import {
  ConsoleAlertDto,
  ConsoleAlertsResponse,
  ZabbixService,
} from '../zabbix/zabbix.service';
import type {
  ConsoleAcknowledgeDto,
  ConsoleAlertsQueryDto,
  ConsoleHostItemsQueryDto,
  ConsoleHostsQueryDto,
} from './console.dto';

type CompanyGroupMeta = {
  companyName: string;
  isPriority: boolean;
};

@Injectable()
export class ConsoleService {
  constructor(
    private readonly zabbix: ZabbixService,
    private readonly tenantScope: TenantScopeService,
    private readonly prisma: PrismaService,
  ) {}

  private parseSeverities(raw?: string): number[] | undefined {
    if (!raw?.trim()) return undefined;
    const values = raw
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((value) => Number.isFinite(value) && value >= 0 && value <= 5);
    return values.length ? values : undefined;
  }

  private async loadCompanyGroupMap(): Promise<Map<string, CompanyGroupMeta>> {
    const companies = await this.prisma.company.findMany({
      where: { deletedAt: null, zabbixGroupName: { not: null } },
      select: {
        name: true,
        zabbixGroupName: true,
        monitoringPriority: true,
      },
    });

    const map = new Map<string, CompanyGroupMeta>();
    for (const company of companies) {
      for (const group of parseZabbixGroupNames(company.zabbixGroupName)) {
        map.set(group.toLowerCase(), {
          companyName: company.name,
          isPriority: company.monitoringPriority,
        });
      }
    }
    return map;
  }

  private async getPriorityCompanyGroups(): Promise<string[]> {
    const companies = await this.prisma.company.findMany({
      where: {
        deletedAt: null,
        monitoringPriority: true,
        zabbixGroupName: { not: null },
      },
      select: { zabbixGroupName: true },
      orderBy: { name: 'asc' },
    });

    const groups = new Set<string>();
    for (const company of companies) {
      for (const group of parseZabbixGroupNames(company.zabbixGroupName)) {
        groups.add(group);
      }
    }
    return [...groups];
  }

  private enrichAlerts(
    response: ConsoleAlertsResponse,
    companyByGroup: Map<string, CompanyGroupMeta>,
  ): ConsoleAlertsResponse {
    const alerts = response.alerts.map((alert) => {
      const meta = companyByGroup.get(alert.groupName.trim().toLowerCase());
      return {
        ...alert,
        companyName: meta?.companyName ?? null,
        isPriorityCompany: meta?.isPriority ?? false,
      };
    });

    alerts.sort(
      (a, b) =>
        Number(b.isPriorityCompany) - Number(a.isPriorityCompany) ||
        b.severity - a.severity ||
        b.clock - a.clock ||
        a.hostName?.localeCompare(b.hostName ?? '', 'pt-BR') ||
        0,
    );

    return {
      ...response,
      alerts,
      priorityAlerts: alerts.filter((row) => row.isPriorityCompany),
    };
  }

  private async resolveGroup(
    user: AuthenticatedRequestUser,
    group?: string,
    priorityOnly?: boolean,
  ): Promise<string> {
    const clientGroup = await this.tenantScope.resolveZabbixGroupForList(user);
    if (clientGroup) {
      if (group?.trim()) {
        return this.tenantScope.assertZabbixGroupAccess(user, group);
      }
      return clientGroup;
    }

    if (priorityOnly) {
      const priorityGroups = await this.getPriorityCompanyGroups();
      if (!priorityGroups.length) {
        throw new BadRequestException(
          'Nenhuma empresa marcada como prioritária no cadastro.',
        );
      }
      if (group?.trim()) {
        const normalized = group.trim().toLowerCase();
        const allowed = priorityGroups.some(
          (item) => item.toLowerCase() === normalized,
        );
        if (!allowed) {
          throw new BadRequestException(
            'O grupo selecionado não pertence a uma empresa prioritária.',
          );
        }
        return group.trim();
      }
      return priorityGroups.join(';');
    }

    if (!group?.trim()) {
      throw new BadRequestException(
        'Informe o parâmetro "group" (grupo Zabbix).',
      );
    }

    return group.trim();
  }

  async listAlerts(
    user: AuthenticatedRequestUser,
    query: ConsoleAlertsQueryDto,
  ): Promise<ConsoleAlertsResponse> {
    const group = await this.resolveGroup(
      user,
      query.group,
      query.priorityOnly === 'true',
    );
    const companyByGroup = await this.loadCompanyGroupMap();
    const raw = await this.zabbix.getConsoleAlertsForGroup(group, {
      severities: this.parseSeverities(query.severity),
      acknowledged: query.ack ?? 'all',
      search: query.search,
      limit: query.limit ?? 500,
    });
    return this.enrichAlerts(raw, companyByGroup);
  }

  async listHosts(user: AuthenticatedRequestUser, query: ConsoleHostsQueryDto) {
    const group = await this.resolveGroup(user, query.group);
    const hosts = await this.zabbix.getHostsDetailedByGroup(group);
    const search = query.search?.trim().toLowerCase();

    let filtered = hosts;
    if (query.status === 'enabled') {
      filtered = filtered.filter((host) => host.status === '0');
    } else if (query.status === 'disabled') {
      filtered = filtered.filter((host) => host.status === '1');
    }

    if (search) {
      filtered = filtered.filter(
        (host) =>
          host.name.toLowerCase().includes(search) ||
          host.host.toLowerCase().includes(search),
      );
    }

    return {
      group,
      hosts: filtered.map((host) => ({
        hostid: host.hostid,
        host: host.host,
        name: host.name,
        status: host.status === '0' ? 'enabled' : 'disabled',
        maintenance: host.maintenance_status === '1',
        groups: host.groups?.map((g) => g.name) ?? [],
        primaryIp:
          host.interfaces?.find((iface) => iface.main === '1')?.ip ??
          host.interfaces?.[0]?.ip ??
          null,
      })),
      fetchedAt: new Date().toISOString(),
    };
  }

  async getHostItems(
    user: AuthenticatedRequestUser,
    hostid: string,
    query: ConsoleHostItemsQueryDto,
  ) {
    const group = query.group?.trim()
      ? await this.tenantScope.assertZabbixGroupAccess(user, query.group)
      : await this.resolveGroup(user, query.group);

    if (user.role === 'CLIENT' || query.group?.trim()) {
      return this.zabbix.getHostItemsSummaryForGroup(group, hostid);
    }

    return this.zabbix.getHostItemsSummary(hostid);
  }

  async acknowledgeAlert(
    user: AuthenticatedRequestUser,
    eventid: string,
    body: ConsoleAcknowledgeDto,
  ) {
    const group = body.group?.trim()
      ? await this.tenantScope.assertZabbixGroupAccess(user, body.group)
      : await this.resolveGroup(user, body.group);

    const scoped = await this.zabbix.getConsoleAlertsForGroup(group, {
      limit: 1000,
    });
    if (!scoped.alerts.some((alert: ConsoleAlertDto) => alert.eventId === eventid)) {
      throw new BadRequestException(
        'Evento fora do escopo do grupo selecionado.',
      );
    }

    await this.zabbix.acknowledgeEvents(
      [eventid],
      body.message ?? `Reconhecido por ${user.email}`,
    );

    return { ok: true, eventId: eventid };
  }

  async listGroups(user: AuthenticatedRequestUser) {
    const companyByGroup = await this.loadCompanyGroupMap();
    const clientGroup = await this.tenantScope.resolveZabbixGroupForList(user);
    if (clientGroup) {
      return {
        groups: clientGroup.split(';').map((name) => {
          const trimmed = name.trim();
          const meta = companyByGroup.get(trimmed.toLowerCase());
          return {
            name: trimmed,
            companyName: meta?.companyName ?? null,
            isPriority: meta?.isPriority ?? false,
          };
        }),
      };
    }

    const groups = await this.zabbix.getGroups();
    const mapped = groups.map((group) => {
      const meta = companyByGroup.get(group.name.trim().toLowerCase());
      return {
        name: group.name,
        groupid: group.groupid,
        companyName: meta?.companyName ?? null,
        isPriority: meta?.isPriority ?? false,
      };
    });

    mapped.sort(
      (a, b) =>
        Number(b.isPriority) - Number(a.isPriority) ||
        a.name.localeCompare(b.name, 'pt-BR'),
    );

    return { groups: mapped };
  }
}
