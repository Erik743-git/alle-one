import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { TenantScopeService } from '../../common/security/tenant-scope.service';
import {
  ConsoleAlertsResponse,
  ZabbixService,
} from '../zabbix/zabbix.service';
import type {
  ConsoleAcknowledgeDto,
  ConsoleAlertsQueryDto,
  ConsoleHostItemsQueryDto,
  ConsoleHostsQueryDto,
} from './console.dto';

@Injectable()
export class ConsoleService {
  constructor(
    private readonly zabbix: ZabbixService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  private parseSeverities(raw?: string): number[] | undefined {
    if (!raw?.trim()) return undefined;
    const values = raw
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((value) => Number.isFinite(value) && value >= 0 && value <= 5);
    return values.length ? values : undefined;
  }

  private async resolveGroup(
    user: AuthenticatedRequestUser,
    group?: string,
  ): Promise<string> {
    const clientGroup = await this.tenantScope.resolveZabbixGroupForList(user);
    if (clientGroup) {
      if (group?.trim()) {
        return this.tenantScope.assertZabbixGroupAccess(user, group);
      }
      return clientGroup;
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
    const group = await this.resolveGroup(user, query.group);
    return this.zabbix.getConsoleAlertsForGroup(group, {
      severities: this.parseSeverities(query.severity),
      acknowledged: query.ack ?? 'all',
      search: query.search,
      limit: query.limit ?? 500,
    });
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
    if (body.group?.trim()) {
      await this.tenantScope.assertZabbixGroupAccess(user, body.group);
    } else {
      await this.resolveGroup(user, body.group);
    }

    await this.zabbix.acknowledgeEvents(
      [eventid],
      body.message ?? `Reconhecido por ${user.email}`,
    );

    return { ok: true, eventId: eventid };
  }

  async listGroups(user: AuthenticatedRequestUser) {
    const clientGroup = await this.tenantScope.resolveZabbixGroupForList(user);
    if (clientGroup) {
      return {
        groups: clientGroup.split(';').map((name) => ({ name: name.trim() })),
      };
    }
    const groups = await this.zabbix.getGroups();
    return {
      groups: groups.map((group) => ({ name: group.name, groupid: group.groupid })),
    };
  }
}
