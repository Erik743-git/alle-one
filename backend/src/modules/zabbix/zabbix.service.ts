import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

type ZabbixGroup = {
  groupid: string;
  name: string;
};

type ZabbixHostGroupRef = {
  groupid?: string;
  name: string;
};

type ZabbixTemplateRef = {
  templateid: string;
  host: string;
  name: string;
};

type ZabbixInterfaceRef = {
  interfaceid?: string;
  ip?: string;
  dns?: string;
  port?: string;
  type?: string;
  main?: string;
  useip?: string;
  available?: string;
};

type ZabbixTagRef = {
  tag: string;
  value: string;
};

type ZabbixInventoryRef = {
  os?: string;
  hardware?: string;
  software?: string;
  location?: string;
  contact?: string;
};

type ZabbixHost = {
  hostid: string;
  host: string;
  name: string;
  status: string;
  groups: ZabbixHostGroupRef[];
};

type ZabbixDetailedHost = {
  hostid: string;
  host: string;
  name: string;
  description?: string;
  status: string;
  maintenance_status?: string;
  groups: ZabbixHostGroupRef[];
  parentTemplates?: ZabbixTemplateRef[];
  interfaces?: ZabbixInterfaceRef[];
  tags?: ZabbixTagRef[];
  inventory?: ZabbixInventoryRef;
};

type ZabbixProblem = {
  eventid: string;
  objectid: string;
  severity: string;
  name?: string;
  clock?: string;
};

type ZabbixEventHostRef = {
  hostid: string;
  name: string;
};

type ZabbixEvent = {
  eventid: string;
  objectid: string;
  clock: string;
  name?: string;
  severity?: string;
  value?: string;
  acknowledged?: string;
  hosts?: ZabbixEventHostRef[];
};

type ZabbixItem = {
  itemid: string;
  hostid: string;
  name?: string;
  key_?: string;
  lastvalue?: string;
  units?: string;
  value_type?: string;
  status?: string;
  state?: string;
  lastclock?: string;
};

type ZabbixTemplateSummary = {
  templateid: string;
  host: string;
  name: string;
  totalHosts: number;
};

type ZabbixApiSuccess<T> = {
  jsonrpc: '2.0';
  result: T;
  id: number;
};

type ZabbixApiError = {
  jsonrpc: '2.0';
  error: {
    code: number;
    message: string;
    data?: string;
  };
  id: number;
};

type ZabbixOverview = {
  group: string;
  totalHosts: number;
  hostsAtivos: number;
  hostsInativos: number;
  problemasAbertos: number;
  problemasAlta: number;
  problemasMedia: number;
};

@Injectable()
export class ZabbixService {
  private readonly url: string = process.env.ZABBIX_URL ?? '';
  private readonly token: string = process.env.ZABBIX_TOKEN ?? '';

  /** Limite de eventos no período (reduz payload e tempo de resposta). Env: ZABBIX_DASHBOARD_EVENTS_LIMIT */
  private getDashboardEventsLimit(): number {
    const raw = process.env.ZABBIX_DASHBOARD_EVENTS_LIMIT;
    const n = raw !== undefined ? Number(raw) : 2500;
    if (!Number.isFinite(n)) {
      return 2500;
    }
    return Math.min(Math.max(Math.trunc(n), 500), 20000);
  }

  private async request<T>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    if (!this.url) {
      throw new InternalServerErrorException('ZABBIX_URL não definida no .env');
    }

    if (!this.token) {
      throw new InternalServerErrorException(
        'ZABBIX_TOKEN não definido no .env',
      );
    }

    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: 1,
      }),
    });

    const data = (await response.json()) as
      | ZabbixApiSuccess<T>
      | ZabbixApiError;

    if ('error' in data) {
      throw new BadGatewayException(
        data.error.data || data.error.message || 'Erro no Zabbix',
      );
    }

    return data.result;
  }

  private getUnixTimestamp(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = Number(value);

    if (Number.isNaN(parsed)) {
      return undefined;
    }

    return parsed;
  }

  private getTimeRange(days = 7) {
    const now = Math.floor(Date.now() / 1000);
    const from = now - days * 24 * 60 * 60;

    return {
      time_from: from,
      time_till: now,
    };
  }

  /** Nome exato do grupo no Zabbix (como cadastrado na empresa do portal). */
  private async getHostGroupIdByExactName(
    groupName: string,
  ): Promise<string | null> {
    const trimmed = groupName.trim();
    if (!trimmed) {
      return null;
    }

    const groups = await this.request<ZabbixGroup[]>('hostgroup.get', {
      output: ['groupid', 'name'],
      filter: { name: trimmed },
    });

    return groups[0]?.groupid ?? null;
  }

  private buildTemplatesFromDetailedHosts(
    hosts: ZabbixDetailedHost[],
  ): ZabbixTemplateSummary[] {
    const templateMap = new Map<string, ZabbixTemplateSummary>();

    for (const host of hosts) {
      const templates = host.parentTemplates ?? [];

      for (const template of templates) {
        const existing = templateMap.get(template.templateid);

        if (existing) {
          existing.totalHosts += 1;
          continue;
        }

        templateMap.set(template.templateid, {
          templateid: template.templateid,
          host: template.host,
          name: template.name,
          totalHosts: 1,
        });
      }
    }

    return Array.from(templateMap.values()).sort(
      (a, b) =>
        b.totalHosts - a.totalHosts || a.name.localeCompare(b.name, 'pt-BR'),
    );
  }

  private emptyDashboardDetails(
    groupName: string,
    days: number,
  ): {
    overview: ZabbixOverview;
    hosts: ZabbixDetailedHost[];
    templates: ZabbixTemplateSummary[];
    events: ZabbixEvent[];
    resumo: {
      totalTemplates: number;
      totalEventos: number;
      eventosProblema: number;
      eventosRecuperacao: number;
      eventosCriticos: number;
      eventosMedios: number;
    };
    periodo: { dias: number; de?: number; ate?: number };
  } {
    const range = this.getTimeRange(days);

    return {
      overview: {
        group: groupName,
        totalHosts: 0,
        hostsAtivos: 0,
        hostsInativos: 0,
        problemasAbertos: 0,
        problemasAlta: 0,
        problemasMedia: 0,
      },
      hosts: [],
      templates: [],
      events: [],
      resumo: {
        totalTemplates: 0,
        totalEventos: 0,
        eventosProblema: 0,
        eventosRecuperacao: 0,
        eventosCriticos: 0,
        eventosMedios: 0,
      },
      periodo: {
        dias: days,
        de: this.getUnixTimestamp(String(range.time_from)),
        ate: this.getUnixTimestamp(String(range.time_till)),
      },
    };
  }

  async getGroups(): Promise<ZabbixGroup[]> {
    const groups = await this.request<ZabbixGroup[]>('hostgroup.get', {
      output: ['groupid', 'name'],
      sortfield: 'name',
    });

    return groups
      .filter((group) => group.name?.trim())
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  async getHosts(): Promise<ZabbixHost[]> {
    return this.request<ZabbixHost[]>('host.get', {
      output: ['hostid', 'host', 'name', 'status'],
      selectGroups: ['groupid', 'name'],
      sortfield: ['name'],
    });
  }

  /**
   * Problemas abertos (API `problem.get`).
   * Em versões recentes do Zabbix use `hostids` ou `groupids` para filtrar;
   * **não** compare `objectid` do problema com `hostid` — `objectid` costuma ser o trigger.
   */
  async getProblems(): Promise<ZabbixProblem[]> {
    return this.request<ZabbixProblem[]>('problem.get', {
      output: ['eventid', 'objectid', 'severity', 'name', 'clock'],
      sortfield: ['eventid'],
      sortorder: 'DESC',
    });
  }

  /** Problemas apenas dos hosts informados (JSON-RPC 2.0, ver doc atual do Zabbix). */
  async getProblemsForHostIds(hostids: string[]): Promise<ZabbixProblem[]> {
    if (!hostids.length) {
      return [];
    }
    return this.request<ZabbixProblem[]>('problem.get', {
      output: ['eventid', 'objectid', 'severity', 'name', 'clock'],
      hostids,
      sortfield: ['eventid'],
      sortorder: 'DESC',
    });
  }

  async getHostsByGroup(groupName: string): Promise<ZabbixHost[]> {
    const groupid = await this.getHostGroupIdByExactName(groupName);
    if (!groupid) {
      return [];
    }

    return this.request<ZabbixHost[]>('host.get', {
      output: ['hostid', 'host', 'name', 'status'],
      groupids: [groupid],
      selectGroups: ['groupid', 'name'],
      sortfield: ['name'],
    });
  }

  async getHostsDetailedByGroup(
    groupName: string,
  ): Promise<ZabbixDetailedHost[]> {
    const groupid = await this.getHostGroupIdByExactName(groupName);
    if (!groupid) {
      return [];
    }

    return this.request<ZabbixDetailedHost[]>('host.get', {
      output: [
        'hostid',
        'host',
        'name',
        'description',
        'status',
        'maintenance_status',
      ],
      groupids: [groupid],
      selectGroups: ['groupid', 'name'],
      selectParentTemplates: ['templateid', 'host', 'name'],
      selectInterfaces: [
        'interfaceid',
        'ip',
        'dns',
        'port',
        'type',
        'main',
        'useip',
        'available',
      ],
      selectTags: ['tag', 'value'],
      selectInventory: ['os', 'hardware', 'software', 'location', 'contact'],
      sortfield: ['name'],
    });
  }

  async getTemplatesByGroup(
    groupName: string,
  ): Promise<ZabbixTemplateSummary[]> {
    const hosts = await this.getHostsDetailedByGroup(groupName);
    return this.buildTemplatesFromDetailedHosts(hosts);
  }

  async getEventsByGroup(groupName: string, days = 7): Promise<ZabbixEvent[]> {
    const groupid = await this.getHostGroupIdByExactName(groupName);
    if (!groupid) {
      return [];
    }

    const range = this.getTimeRange(days);

    return this.request<ZabbixEvent[]>('event.get', {
      output: [
        'eventid',
        'objectid',
        'clock',
        'name',
        'severity',
        'value',
        'acknowledged',
      ],
      groupids: [groupid],
      source: 0,
      object: 0,
      selectHosts: ['hostid', 'name'],
      sortfield: ['clock'],
      sortorder: 'DESC',
      limit: this.getDashboardEventsLimit(),
      ...range,
    });
  }

  /**
   * Resumo de “itens” (métricas) por host para uso em detalhamento no front.
   * Observação: os `key_` abaixo são os mais comuns, mas podem variar por template/SO.
   */
  async getHostItemsSummary(hostid: string): Promise<{
    hostid: string;
    items: ZabbixItem[];
  }> {
    const normalized = String(hostid ?? '').trim();
    if (!normalized) {
      return { hostid: '', items: [] };
    }

    // Chaves mais úteis para “apresentação” (CPU/Memória/Disco) — ajuste conforme templates.
    const desiredKeySubstrings = [
      'system.cpu.util', // CPU utilization
      'vm.memory.size', // memory (depends on params)
      'vfs.fs.size', // filesystem usage
    ];

    const items = await this.request<ZabbixItem[]>('item.get', {
      output: [
        'itemid',
        'hostid',
        'name',
        'key_',
        'lastvalue',
        'units',
        'value_type',
        'status',
        'state',
        'lastclock',
      ],
      hostids: [normalized],
      // `search` faz “contains”; filtramos de novo em memória para manter só o essencial.
      search: { key_: desiredKeySubstrings.join(' ') },
      sortfield: ['name'],
    });

    const filtered = (items ?? []).filter((it) => {
      const k = String(it.key_ ?? '');
      if (!k) return false;
      return desiredKeySubstrings.some((s) => k.includes(s));
    });

    return { hostid: normalized, items: filtered };
  }

  async getOverviewByGroup(groupName: string): Promise<ZabbixOverview> {
    const groupid = await this.getHostGroupIdByExactName(groupName);
    if (!groupid) {
      return {
        group: groupName,
        totalHosts: 0,
        hostsAtivos: 0,
        hostsInativos: 0,
        problemasAbertos: 0,
        problemasAlta: 0,
        problemasMedia: 0,
      };
    }

    const [hostsEmpresa, problemasEmpresa] = await Promise.all([
      this.request<ZabbixHost[]>('host.get', {
        output: ['hostid', 'status'],
        groupids: [groupid],
      }),
      this.request<ZabbixProblem[]>('problem.get', {
        output: ['eventid', 'objectid', 'severity', 'name', 'clock'],
        groupids: [groupid],
        sortfield: ['eventid'],
        sortorder: 'DESC',
      }),
    ]);

    return {
      group: groupName,
      totalHosts: hostsEmpresa.length,
      hostsAtivos: hostsEmpresa.filter((host) => host.status === '0').length,
      hostsInativos: hostsEmpresa.filter((host) => host.status === '1').length,
      problemasAbertos: problemasEmpresa.length,
      // Zabbix: 4=Alta, 5=Desastre (ambos “críticos” no dashboard)
      problemasAlta: problemasEmpresa.filter(
        (problem) => Number(problem.severity) >= 4,
      ).length,
      problemasMedia: problemasEmpresa.filter(
        (problem) => Number(problem.severity) === 3,
      ).length,
    };
  }

  async getDashboardDetailsByGroup(groupName: string, days = 7) {
    const groupid = await this.getHostGroupIdByExactName(groupName);
    if (!groupid) {
      return this.emptyDashboardDetails(groupName, days);
    }

    const range = this.getTimeRange(days);

    const [detailedHosts, problems, events] = await Promise.all([
      this.request<ZabbixDetailedHost[]>('host.get', {
        output: [
          'hostid',
          'host',
          'name',
          'description',
          'status',
          'maintenance_status',
        ],
        groupids: [groupid],
        selectGroups: ['groupid', 'name'],
        selectParentTemplates: ['templateid', 'host', 'name'],
        selectInterfaces: [
          'interfaceid',
          'ip',
          'dns',
          'port',
          'type',
          'main',
          'useip',
          'available',
        ],
        selectTags: ['tag', 'value'],
        selectInventory: ['os', 'hardware', 'software', 'location', 'contact'],
        sortfield: ['name'],
      }),
      this.request<ZabbixProblem[]>('problem.get', {
        output: ['eventid', 'objectid', 'severity', 'name', 'clock'],
        groupids: [groupid],
        sortfield: ['eventid'],
        sortorder: 'DESC',
      }),
      this.request<ZabbixEvent[]>('event.get', {
        output: [
          'eventid',
          'objectid',
          'clock',
          'name',
          'severity',
          'value',
          'acknowledged',
        ],
        groupids: [groupid],
        source: 0,
        object: 0,
        selectHosts: ['hostid', 'name'],
        sortfield: ['clock'],
        sortorder: 'DESC',
        limit: this.getDashboardEventsLimit(),
        ...range,
      }),
    ]);

    const overview: ZabbixOverview = {
      group: groupName,
      totalHosts: detailedHosts.length,
      hostsAtivos: detailedHosts.filter((host) => host.status === '0').length,
      hostsInativos: detailedHosts.filter((host) => host.status === '1').length,
      problemasAbertos: problems.length,
      problemasAlta: problems.filter((p) => Number(p.severity) >= 4).length,
      problemasMedia: problems.filter((p) => Number(p.severity) === 3).length,
    };

    const templates = this.buildTemplatesFromDetailedHosts(detailedHosts);

    const eventosCriticos = events.filter(
      (event) => Number(event.severity ?? 0) >= 4,
    ).length;

    const eventosMedios = events.filter(
      (event) => Number(event.severity ?? 0) === 3,
    ).length;

    const eventosProblema = events.filter(
      (event) => event.value === '1',
    ).length;
    const eventosRecuperacao = events.filter(
      (event) => event.value === '0',
    ).length;

    return {
      overview,
      hosts: detailedHosts,
      templates,
      events,
      resumo: {
        totalTemplates: templates.length,
        totalEventos: events.length,
        eventosProblema,
        eventosRecuperacao,
        eventosCriticos,
        eventosMedios,
      },
      periodo: {
        dias: days,
        de: this.getUnixTimestamp(String(this.getTimeRange(days).time_from)),
        ate: this.getUnixTimestamp(String(this.getTimeRange(days).time_till)),
      },
    };
  }
}
