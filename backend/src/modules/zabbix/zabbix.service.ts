import { randomUUID } from 'crypto';
import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ZabbixDbService } from './zabbix-db.service';
import type { ZabbixDashboardDetails } from './zabbix.types';
import { parseZabbixGroupNames } from '../companies/zabbix-groups.util';

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
  host?: string;
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

export type ConsoleAlertDto = {
  eventId: string;
  objectId: string;
  name: string;
  severity: number;
  clock: number;
  acknowledged: boolean;
  durationSeconds: number;
  hostId: string | null;
  hostName: string | null;
  tags: Array<{ tag: string; value: string }>;
  groupName: string;
};

export type ConsoleAlertsResponse = {
  group: string;
  alerts: ConsoleAlertDto[];
  priorityAlerts: ConsoleAlertDto[];
  fetchedAt: string;
};

type ZabbixProblemConsole = ZabbixProblem & {
  acknowledged?: string;
  tags?: ZabbixTagRef[];
};

type ZabbixTriggerWithHosts = {
  triggerid: string;
  hosts?: ZabbixEventHostRef[];
};

export type { ZabbixDashboardDetails } from './zabbix.types';

@Injectable()
export class ZabbixService {
  private readonly logger = new Logger(ZabbixService.name);
  private readonly url: string = process.env.ZABBIX_URL ?? '';
  private readonly token: string = process.env.ZABBIX_TOKEN ?? '';
  private readonly dashboardCacheEnabled =
    process.env.ZABBIX_DASHBOARD_CACHE_ENABLED !== 'false';

  constructor(
    private readonly prisma: PrismaService,
    private readonly zabbixDb: ZabbixDbService,
  ) {}

  private hasApiConfig(): boolean {
    return Boolean(this.url?.trim() && this.token?.trim());
  }

  /** Cache em Postgres (external_api_cache). Env: ZABBIX_DASHBOARD_CACHE_MS */
  private getDashboardCacheTtlMs(): number {
    const raw = process.env.ZABBIX_DASHBOARD_CACHE_MS;
    const n = raw !== undefined ? Number(raw) : 3_600_000;
    if (!Number.isFinite(n)) {
      return 3_600_000;
    }
    return Math.min(Math.max(Math.trunc(n), 60_000), 86_400_000);
  }

  private buildDashboardCacheKey(
    groupid: string,
    range: { time_from: number; time_till: number },
  ): string {
    return `zabbix:dashboard:v2:${groupid}:${range.time_from}:${range.time_till}`;
  }

  private async getDashboardCache(
    cacheKey: string,
  ): Promise<ZabbixDashboardDetails | null> {
    if (!this.dashboardCacheEnabled) {
      return null;
    }

    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ payload: unknown; expires_at: Date }>
      >`
        select payload, expires_at
        from external_api_cache
        where cache_key = ${cacheKey}
        limit 1
      `;
      const row = rows[0];
      if (!row || row.expires_at.getTime() <= Date.now()) {
        return null;
      }
      return row.payload as ZabbixDashboardDetails;
    } catch {
      return null;
    }
  }

  private async setDashboardCache(
    cacheKey: string,
    payload: ZabbixDashboardDetails,
  ): Promise<void> {
    if (!this.dashboardCacheEnabled) {
      return;
    }

    const ttlMs = this.getDashboardCacheTtlMs();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    try {
      const id = randomUUID();
      const payloadJson = JSON.stringify(payload);
      await this.prisma.$executeRaw`
        insert into external_api_cache (id, provider, cache_key, payload, fetched_at, expires_at)
        values (${id}, 'ZABBIX', ${cacheKey}, ${payloadJson}::jsonb, ${now}, ${expiresAt})
        on conflict (cache_key)
        do update set
          provider = excluded.provider,
          payload = excluded.payload,
          fetched_at = excluded.fetched_at,
          expires_at = excluded.expires_at
      `;
    } catch (err) {
      this.logger.warn(
        `Falha ao gravar cache Zabbix (key=${cacheKey}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async invalidateDashboardCache(
    groupName: string,
    period: number | { startDate: Date; endDate: Date },
  ): Promise<void> {
    const groupNames = parseZabbixGroupNames(groupName);
    if (groupNames.length > 1) {
      await Promise.all(
        groupNames.map((group) => this.invalidateDashboardCache(group, period)),
      );
      return;
    }

    const groupid = await this.getHostGroupIdByExactName(groupName);
    if (!groupid) {
      return;
    }

    const { range } = this.resolveDashboardPeriod(period);
    const cacheKey = this.buildDashboardCacheKey(groupid, range);

    try {
      await this.prisma.$executeRaw`
        delete from external_api_cache where cache_key = ${cacheKey}
      `;
    } catch (err) {
      this.logger.warn(
        `Falha ao invalidar cache Zabbix (key=${cacheKey}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Tamanho de página na paginação de event.get do dashboard. Env: ZABBIX_DASHBOARD_EVENTS_LIMIT */
  private getDashboardEventsPageSize(): number {
    const raw = process.env.ZABBIX_DASHBOARD_EVENTS_LIMIT;
    const n = raw !== undefined ? Number(raw) : 2500;
    if (!Number.isFinite(n)) {
      return 2500;
    }
    return Math.min(Math.max(Math.trunc(n), 500), 20000);
  }

  /** Máximo de páginas ao buscar eventos do período (evita loop). Env: ZABBIX_DASHBOARD_EVENTS_MAX_PAGES */
  private getDashboardEventsMaxPages(): number {
    const raw = process.env.ZABBIX_DASHBOARD_EVENTS_MAX_PAGES;
    const n = raw !== undefined ? Number(raw) : 40;
    if (!Number.isFinite(n)) {
      return 40;
    }
    return Math.min(Math.max(Math.trunc(n), 1), 200);
  }

  /**
   * Busca todos os eventos do intervalo (paginação por eventid).
   * Sem isso, só os 2.500 mais recentes entram no dashboard e High/Disaster ficam abaixo do Zabbix.
   */
  private async fetchAllDashboardEventsForGroup(
    groupid: string,
    range: { time_from: number; time_till: number },
  ): Promise<ZabbixEvent[]> {
    const pageSize = this.getDashboardEventsPageSize();
    const maxPages = this.getDashboardEventsMaxPages();
    const all: ZabbixEvent[] = [];
    let eventidFrom: string | undefined;

    for (let page = 0; page < maxPages; page++) {
      const params: Record<string, unknown> = {
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
        // Dashboard só agrega High (4) e Disaster (5), apenas eventos de problema (value=1).
        severities: [4, 5],
        value: 1,
        selectHosts: ['hostid', 'host', 'name'],
        sortfield: ['eventid'],
        sortorder: 'ASC',
        limit: pageSize,
        time_from: range.time_from,
        time_till: range.time_till,
      };

      if (eventidFrom) {
        params.eventid_from = eventidFrom;
      }

      const batch = await this.request<ZabbixEvent[]>('event.get', params);

      if (!batch.length) {
        break;
      }

      all.push(...batch);

      if (batch.length < pageSize) {
        break;
      }

      const maxEventId = batch.reduce(
        (max, event) => Math.max(max, Number(event.eventid)),
        0,
      );
      eventidFrom = String(maxEventId + 1);
    }

    return all;
  }

  private applyHostDisplayNames(
    events: ZabbixEvent[],
    detailedHosts: ZabbixDetailedHost[],
  ): ZabbixEvent[] {
    const labelByHostId = new Map<string, string>();

    for (const host of detailedHosts) {
      const label = host.name?.trim() || host.host?.trim() || host.hostid;
      labelByHostId.set(host.hostid, label);
    }

    for (const event of events) {
      const ref = event.hosts?.[0];
      if (!ref?.hostid) {
        continue;
      }

      const label = labelByHostId.get(ref.hostid);
      if (label) {
        ref.name = label;
      }
    }

    return events;
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

  /** Alinha a consulta ao intervalo do filtro do dashboard (ex.: mês passado), não “últimos N dias até agora”. */
  private getTimeRangeFromDates(startDate: Date, endDate: Date) {
    const from = Math.floor(startDate.getTime() / 1000);
    const till = Math.floor(endDate.getTime() / 1000);

    return {
      time_from: Math.min(from, till),
      time_till: Math.max(from, till),
    };
  }

  private resolveDashboardPeriod(
    period: number | { startDate: Date; endDate: Date },
  ) {
    if (typeof period === 'number') {
      const range = this.getTimeRange(period);
      return { range, days: period };
    }

    const range = this.getTimeRangeFromDates(
      period.startDate,
      period.endDate,
    );
    const diffMs = period.endDate.getTime() - period.startDate.getTime();
    const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    return { range, days };
  }

  /** Nome exato do grupo no Zabbix (como cadastrado na empresa do portal). */
  private async getHostGroupIdByExactName(
    groupName: string,
  ): Promise<string | null> {
    const trimmed = groupName.trim();
    if (!trimmed) {
      return null;
    }

    if (this.hasApiConfig()) {
      const groups = await this.request<ZabbixGroup[]>('hostgroup.get', {
        output: ['groupid', 'name'],
        filter: { name: trimmed },
      });

      return groups[0]?.groupid ?? null;
    }

    const dbGroups = await this.zabbixDb.listHostGroups();
    const match = dbGroups.find((group) => group.name === trimmed);
    return match?.groupid ?? null;
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
    if (this.hasApiConfig()) {
      const groups = await this.request<ZabbixGroup[]>('hostgroup.get', {
        output: ['groupid', 'name'],
        sortfield: 'name',
      });

      return groups
        .filter((group) => group.name?.trim())
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }

    const dbGroups = await this.zabbixDb.listHostGroups();
    if (dbGroups.length) {
      this.logger.debug(
        `Grupos Zabbix via DB (zabbix.host_groups): ${dbGroups.length}`,
      );
      return dbGroups.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }

    throw new InternalServerErrorException(
      'Zabbix indisponível: configure ZABBIX_URL/ZABBIX_TOKEN no .env ou mantenha o sync zabbix ativo.',
    );
  }

  /** Busca grupos na API do Zabbix (cadastro de empresas). Exige ZABBIX_URL + ZABBIX_TOKEN. */
  async searchGroups(query: string, limit = 80): Promise<ZabbixGroup[]> {
    if (!this.hasApiConfig()) {
      throw new InternalServerErrorException(
        'Configure ZABBIX_URL e ZABBIX_TOKEN no .env do backend para buscar grupos no Zabbix.',
      );
    }

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return [];
    }

    const needle = trimmed.toLowerCase();

    let groups = await this.request<ZabbixGroup[]>('hostgroup.get', {
      output: ['groupid', 'name'],
      sortfield: 'name',
      limit,
      search: { name: `*${trimmed}*` },
      searchWildcardsEnabled: true,
    });

    if (!groups.length) {
      const allGroups = await this.request<ZabbixGroup[]>('hostgroup.get', {
        output: ['groupid', 'name'],
        sortfield: 'name',
        limit: 500,
      });

      groups = allGroups.filter((group) =>
        group.name?.toLowerCase().includes(needle),
      );
    }

    return groups
      .filter((group) => group.name?.trim())
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .slice(0, limit);
  }

  /** Resolve nome do grupo (exato ou case-insensitive) para validação no cadastro. */
  async resolveGroupByName(input: string): Promise<{
    exists: boolean;
    groupid: string | null;
    name: string | null;
  }> {
    const trimmed = input.trim();
    if (!trimmed) {
      return { exists: false, groupid: null, name: null };
    }

    const exactId = await this.getHostGroupIdByExactName(trimmed);
    if (exactId) {
      return { exists: true, groupid: exactId, name: trimmed };
    }

    if (this.hasApiConfig()) {
      const candidates = await this.searchGroups(trimmed, 30);
      const match = candidates.find(
        (group) => group.name.toLowerCase() === trimmed.toLowerCase(),
      );
      if (match) {
        return { exists: true, groupid: match.groupid, name: match.name };
      }
    } else {
      const groups = await this.getGroups();
      const match = groups.find(
        (group) => group.name.toLowerCase() === trimmed.toLowerCase(),
      );

      if (match) {
        return { exists: true, groupid: match.groupid, name: match.name };
      }
    }

    return { exists: false, groupid: null, name: null };
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
    const groupNames = parseZabbixGroupNames(groupName);
    if (groupNames.length > 1) {
      const rows = await Promise.all(
        groupNames.map((group) => this.getHostsByGroup(group)),
      );
      return this.dedupeBy(rows.flat(), (host) => host.hostid);
    }

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
    const groupNames = parseZabbixGroupNames(groupName);
    if (groupNames.length > 1) {
      const rows = await Promise.all(
        groupNames.map((group) => this.getHostsDetailedByGroup(group)),
      );
      return this.dedupeBy(rows.flat(), (host) => host.hostid);
    }

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
    return this.dedupeBy(
      this.buildTemplatesFromDetailedHosts(hosts),
      (template) => template.templateid,
    );
  }

  async getEventsByGroup(groupName: string, days = 7): Promise<ZabbixEvent[]> {
    const groupNames = parseZabbixGroupNames(groupName);
    if (groupNames.length > 1) {
      const rows = await Promise.all(
        groupNames.map((group) => this.getEventsByGroup(group, days)),
      );
      return this.dedupeBy(rows.flat(), (event) => event.eventid).sort(
        (a, b) => Number(b.clock ?? 0) - Number(a.clock ?? 0),
      );
    }

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
      limit: this.getDashboardEventsPageSize(),
      ...range,
    });
  }

  /**
   * Resumo de “itens” (métricas) por host para uso em detalhamento no front.
   * Observação: os `key_` abaixo são os mais comuns, mas podem variar por template/SO.
   */
  async getHostItemsSummaryForGroup(
    groupName: string,
    hostid: string,
  ): Promise<{
    hostid: string;
    items: ZabbixItem[];
  }> {
    const normalizedHostId = String(hostid ?? '').trim();
    const hosts = await this.getHostsByGroup(groupName);
    const allowed = hosts.some(
      (host) => String(host.hostid) === normalizedHostId,
    );

    if (!allowed) {
      throw new ForbiddenException(
        'Host não pertence ao grupo informado.',
      );
    }

    return this.getHostItemsSummary(normalizedHostId);
  }

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
    const groupNames = parseZabbixGroupNames(groupName);
    if (groupNames.length > 1) {
      const details = await this.getDashboardDetailsByGroup(groupName, 7, {
        skipCache: true,
      });
      return details.overview;
    }

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

  private dedupeBy<T>(
    items: T[],
    getKey: (item: T, index: number) => string | null | undefined,
  ): T[] {
    const seen = new Set<string>();
    const result: T[] = [];

    for (const [index, item] of items.entries()) {
      const key = getKey(item, index);
      if (!key) {
        result.push(item);
        continue;
      }
      if (seen.has(key)) continue;

      seen.add(key);
      result.push(item);
    }

    return result;
  }

  private recordKey(
    item: unknown,
    candidates: string[],
    fallbackPrefix: string,
    index: number,
  ): string {
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      for (const field of candidates) {
        const value = record[field];
        if (value !== undefined && value !== null && String(value).trim()) {
          return String(value);
        }
      }
    }

    return `${fallbackPrefix}:${index}`;
  }

  private mergeDashboardDetails(
    groupName: string,
    days: number,
    range: { time_from: number; time_till: number },
    packs: ZabbixDashboardDetails[],
  ): ZabbixDashboardDetails {
    const hosts = this.dedupeBy(
      packs.flatMap((pack) => pack.hosts),
      (host, index) => this.recordKey(host, ['hostid', 'host', 'name'], 'host', index),
    );
    const templates = this.dedupeBy(
      packs.flatMap((pack) => pack.templates),
      (template, index) =>
        this.recordKey(template, ['templateid', 'host', 'name'], 'template', index),
    );
    const events = this.dedupeBy(
      packs.flatMap((pack) => pack.events),
      (event, index) =>
        this.recordKey(event, ['eventid', 'objectid'], 'event', index),
    );

    const totalHosts = hosts.length;
    const hostsAtivos = hosts.filter(
      (host) =>
        host &&
        typeof host === 'object' &&
        String((host as Record<string, unknown>).status) === '0',
    ).length;
    const hostsInativos = hosts.filter(
      (host) =>
        host &&
        typeof host === 'object' &&
        String((host as Record<string, unknown>).status) === '1',
    ).length;
    const problemasAbertos = packs.reduce(
      (sum, pack) => sum + pack.overview.problemasAbertos,
      0,
    );
    const problemasAlta = packs.reduce(
      (sum, pack) => sum + pack.overview.problemasAlta,
      0,
    );
    const problemasMedia = packs.reduce(
      (sum, pack) => sum + pack.overview.problemasMedia,
      0,
    );

    const eventosCriticos = events.filter(
      (event) => Number(event.severity ?? 0) >= 4,
    ).length;
    const eventosMedios = events.filter(
      (event) => Number(event.severity ?? 0) === 3,
    ).length;
    const eventosProblema = events.filter((event) => event.value === '1').length;
    const eventosRecuperacao = events.filter((event) => event.value === '0').length;

    return {
      overview: {
        group: groupName,
        totalHosts,
        hostsAtivos,
        hostsInativos,
        problemasAbertos,
        problemasAlta,
        problemasMedia,
      },
      hosts,
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
        de: this.getUnixTimestamp(String(range.time_from)),
        ate: this.getUnixTimestamp(String(range.time_till)),
      },
    };
  }

  async getDashboardDetailsByGroup(
    groupName: string,
    period: number | { startDate: Date; endDate: Date } = 7,
    options?: { skipCache?: boolean },
  ): Promise<ZabbixDashboardDetails> {
    const groupNames = parseZabbixGroupNames(groupName);
    const { range, days } = this.resolveDashboardPeriod(period);
    const startDate = new Date(range.time_from * 1000);
    const endDate = new Date(range.time_till * 1000);

    if (groupNames.length > 1) {
      const packs = await Promise.all(
        groupNames.map((group) =>
          this.getDashboardDetailsByGroup(group, period, options),
        ),
      );
      return this.mergeDashboardDetails(groupName, days, range, packs);
    }

    const useDbCache = process.env.ZABBIX_USE_DB_CACHE !== 'false';
    if (useDbCache && !options?.skipCache) {
      const dbResult = await this.zabbixDb.getDashboardDetailsByGroup(
        groupName,
        startDate,
        endDate,
      );
      if (dbResult.usable && dbResult.data) {
        await this.attachLiveOpenProblems(dbResult.data, groupName);
        return dbResult.data;
      }
      if (dbResult.reason) {
        this.logger.debug(
          `Zabbix DB indisponível (${dbResult.reason}); fallback API (${groupName}).`,
        );
      }
    }

    const groupid = await this.getHostGroupIdByExactName(groupName);
    if (!groupid) {
      return this.emptyDashboardDetails(groupName, days);
    }

    const cacheKey = this.buildDashboardCacheKey(groupid, range);
    if (!options?.skipCache) {
      const cached = await this.getDashboardCache(cacheKey);
      if (cached) {
        this.logger.debug(
          `Cache Zabbix dashboard hit (${groupName}, ${range.time_from}-${range.time_till})`,
        );
        return cached;
      }
    }

    const pack = await this.fetchDashboardDetailsByGroup({
      groupName,
      groupid,
      range,
      days,
    });

    void this.setDashboardCache(cacheKey, pack);
    return pack;
  }

  /** Problemas abertos continuam ao vivo (consulta leve). */
  private async attachLiveOpenProblems(
    pack: ZabbixDashboardDetails,
    groupName: string,
  ): Promise<void> {
    try {
      const groupid = await this.getHostGroupIdByExactName(groupName);
      if (!groupid) return;

      const problems = await this.request<ZabbixProblem[]>('problem.get', {
        output: ['eventid', 'objectid', 'severity', 'name', 'clock'],
        groupids: [groupid],
        sortfield: ['eventid'],
        sortorder: 'DESC',
      });

      pack.overview.problemasAbertos = problems.length;
      pack.overview.problemasAlta = problems.filter(
        (p) => Number(p.severity) >= 4,
      ).length;
      pack.overview.problemasMedia = problems.filter(
        (p) => Number(p.severity) === 3,
      ).length;
    } catch (err) {
      this.logger.warn(
        `Falha ao buscar problemas abertos (${groupName}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async fetchDashboardDetailsByGroup(params: {
    groupName: string;
    groupid: string;
    range: { time_from: number; time_till: number };
    days: number;
  }): Promise<ZabbixDashboardDetails> {
    const { groupName, groupid, range, days } = params;

    const [detailedHosts, problems, rawEvents] = await Promise.all([
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
      this.fetchAllDashboardEventsForGroup(groupid, range),
    ]);

    const events = this.applyHostDisplayNames(rawEvents, detailedHosts);

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
        de: this.getUnixTimestamp(String(range.time_from)),
        ate: this.getUnixTimestamp(String(range.time_till)),
      },
    };
  }

  async getConsoleAlertsForGroup(
    groupName: string,
    options: {
      severities?: number[];
      acknowledged?: 'yes' | 'no' | 'all';
      search?: string;
      limit?: number;
    } = {},
  ): Promise<ConsoleAlertsResponse> {
    const groupNames = parseZabbixGroupNames(groupName);
    if (groupNames.length > 1) {
      const parts = await Promise.all(
        groupNames.map((group) => this.getConsoleAlertsForGroup(group, options)),
      );
      const merged = this.dedupeBy(
        parts.flatMap((part) => part.alerts),
        (alert) => alert.eventId,
      );
      merged.sort(
        (a, b) =>
          b.severity - a.severity ||
          b.clock - a.clock ||
          a.hostName?.localeCompare(b.hostName ?? '', 'pt-BR') ||
          0,
      );
      const limit = options.limit ?? 500;
      const alerts = merged.slice(0, limit);
      return {
        group: groupName,
        alerts,
        priorityAlerts: alerts.filter((row) => row.severity >= 4),
        fetchedAt: new Date().toISOString(),
      };
    }

    const groupid = await this.getHostGroupIdByExactName(groupName);
    if (!groupid) {
      return {
        group: groupName,
        alerts: [],
        priorityAlerts: [],
        fetchedAt: new Date().toISOString(),
      };
    }

    const problems = await this.request<ZabbixProblemConsole[]>('problem.get', {
      output: ['eventid', 'objectid', 'name', 'severity', 'clock', 'acknowledged'],
      groupids: [groupid],
      selectTags: ['tag', 'value'],
      sortfield: ['severity', 'eventid'],
      sortorder: 'DESC',
    });

    const triggerIds = [
      ...new Set(problems.map((problem) => problem.objectid).filter(Boolean)),
    ];
    const triggers = triggerIds.length
      ? await this.request<ZabbixTriggerWithHosts[]>('trigger.get', {
          triggerids: triggerIds,
          output: ['triggerid'],
          selectHosts: ['hostid', 'name', 'host'],
        })
      : [];
    const hostByTrigger = new Map(
      triggers.map((trigger) => [
        trigger.triggerid,
        trigger.hosts?.[0] ?? null,
      ]),
    );

    const now = Math.floor(Date.now() / 1000);
    let alerts: ConsoleAlertDto[] = problems.map((problem) => {
      const host = hostByTrigger.get(problem.objectid);
      const clock = Number(problem.clock ?? now);
      return {
        eventId: problem.eventid,
        objectId: problem.objectid,
        name: problem.name?.trim() || 'Problema sem descrição',
        severity: Number(problem.severity ?? 0),
        clock,
        acknowledged: problem.acknowledged === '1',
        durationSeconds: Math.max(0, now - clock),
        hostId: host?.hostid ?? null,
        hostName: host?.name ?? host?.host ?? null,
        tags: problem.tags ?? [],
        groupName,
      };
    });

    if (options.severities?.length) {
      const allowed = new Set(options.severities);
      alerts = alerts.filter((alert) => allowed.has(alert.severity));
    }

    if (options.acknowledged === 'yes') {
      alerts = alerts.filter((alert) => alert.acknowledged);
    } else if (options.acknowledged === 'no') {
      alerts = alerts.filter((alert) => !alert.acknowledged);
    }

    const search = options.search?.trim().toLowerCase();
    if (search) {
      alerts = alerts.filter(
        (alert) =>
          alert.name.toLowerCase().includes(search) ||
          (alert.hostName?.toLowerCase().includes(search) ?? false),
      );
    }

    const limit = options.limit ?? 500;
    alerts = alerts.slice(0, limit);

    return {
      group: groupName,
      alerts,
      priorityAlerts: alerts.filter((row) => row.severity >= 4),
      fetchedAt: new Date().toISOString(),
    };
  }

  async acknowledgeEvents(eventIds: string[], message: string) {
    if (!eventIds.length) {
      throw new BadGatewayException('Nenhum evento informado para reconhecer.');
    }
    return this.request<{ eventids?: string[] }>('event.acknowledge', {
      eventids: eventIds,
      action: 6,
      message: message.trim() || 'Reconhecido via Portal AlleOne',
    });
  }
}
