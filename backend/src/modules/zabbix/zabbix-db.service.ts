import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { ZabbixDashboardDetails } from './zabbix.types';

type DbHostRow = {
  hostid: string;
  host: string;
  name: string;
  description: string | null;
  status: string;
  maintenance_status: string | null;
  raw_json: unknown;
};

type DbEventRow = {
  eventid: string;
  objectid: string | null;
  clock: Date;
  name: string | null;
  severity: number;
  acknowledged: boolean;
  hostid: string | null;
  host_name: string | null;
};

type DbSyncStateRow = {
  last_sync_at: Date | null;
  backfill_done: boolean;
};

export type ZabbixDbDashboardResult = {
  data: ZabbixDashboardDetails | null;
  usable: boolean;
  reason?: string;
};

@Injectable()
export class ZabbixDbService {
  private readonly logger = new Logger(ZabbixDbService.name);
  private schemaChecked = false;
  private schemaAvailable = false;

  constructor(private readonly prisma: PrismaService) {}

  private getStaleHours(): number {
    const raw = Number(process.env.ZABBIX_DB_STALE_HOURS ?? 2);
    if (!Number.isFinite(raw) || raw <= 0) return 2;
    return Math.min(Math.trunc(raw), 168);
  }

  private async ensureSchema(): Promise<boolean> {
    if (this.schemaChecked) {
      return this.schemaAvailable;
    }
    this.schemaChecked = true;
    try {
      await this.prisma.$queryRaw`SELECT 1 FROM zabbix.sync_state LIMIT 1`;
      this.schemaAvailable = true;
    } catch {
      this.schemaAvailable = false;
    }
    return this.schemaAvailable;
  }

  async getDashboardDetailsByGroup(
    groupName: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ZabbixDbDashboardResult> {
    if (!(await this.ensureSchema())) {
      return { data: null, usable: false, reason: 'schema_indisponivel' };
    }

    const groups = await this.prisma.$queryRaw<
      Array<{ groupid: string; name: string }>
    >`
      SELECT groupid, name
      FROM zabbix.host_groups
      WHERE name = ${groupName.trim()}
      LIMIT 1
    `;

    const group = groups[0];
    if (!group) {
      return { data: null, usable: false, reason: 'grupo_nao_sincronizado' };
    }

    const stateRows = await this.prisma.$queryRaw<DbSyncStateRow[]>`
      SELECT last_sync_at, backfill_done
      FROM zabbix.sync_state
      WHERE groupid = ${group.groupid}
      LIMIT 1
    `;
    const state = stateRows[0];

    if (!state?.last_sync_at) {
      return { data: null, usable: false, reason: 'sync_nunca_executado' };
    }

    const staleMs = this.getStaleHours() * 60 * 60 * 1000;
    if (Date.now() - state.last_sync_at.getTime() > staleMs) {
      return { data: null, usable: false, reason: 'sync_desatualizado' };
    }

    const hostRows = await this.prisma.$queryRaw<DbHostRow[]>`
      SELECT h.hostid, h.host, h.name, h.description, h.status, h.maintenance_status, h.raw_json
      FROM zabbix.hosts h
      INNER JOIN zabbix.host_group_members m ON m.hostid = h.hostid
      WHERE m.groupid = ${group.groupid}
      ORDER BY h.name ASC
    `;

    const eventRows = await this.prisma.$queryRaw<DbEventRow[]>`
      SELECT
        eventid::text,
        objectid,
        clock,
        name,
        severity,
        acknowledged,
        hostid,
        host_name
      FROM zabbix.problem_events
      WHERE groupid = ${group.groupid}
        AND clock >= ${startDate}
        AND clock <= ${endDate}
      ORDER BY clock ASC
    `;

    const totals = await this.prisma.$queryRaw<
      Array<{ hosts: number; events: number }>
    >`
      SELECT
        (
          SELECT count(*)::int
          FROM zabbix.host_group_members
          WHERE groupid = ${group.groupid}
        ) AS hosts,
        (
          SELECT count(*)::int
          FROM zabbix.problem_events
          WHERE groupid = ${group.groupid}
        ) AS events
    `;
    const totalHosts = Number(totals[0]?.hosts ?? 0);
    const totalEvents = Number(totals[0]?.events ?? 0);

    if (totalHosts === 0 && totalEvents === 0) {
      return {
        data: null,
        usable: false,
        reason: 'grupo_sem_dados_no_banco',
      };
    }

    if (!eventRows.length && !state.backfill_done) {
      return { data: null, usable: false, reason: 'backfill_em_andamento' };
    }

    if (totalEvents === 0) {
      return { data: null, usable: false, reason: 'sem_eventos_no_banco' };
    }

    const detailedHosts = hostRows.map((row) => {
      const raw =
        row.raw_json && typeof row.raw_json === 'object'
          ? (row.raw_json as Record<string, unknown>)
          : {};
      const parentTemplates = Array.isArray(raw.parentTemplates)
        ? raw.parentTemplates
        : [];
      return {
        hostid: row.hostid,
        host: row.host,
        name: row.name,
        description: row.description ?? undefined,
        status: row.status,
        maintenance_status: row.maintenance_status ?? undefined,
        groups: [{ groupid: group.groupid, name: group.name }],
        parentTemplates,
      };
    });

    const events = eventRows.map((row) => ({
      eventid: row.eventid,
      objectid: row.objectid ?? '',
      clock: String(Math.floor(row.clock.getTime() / 1000)),
      name: row.name ?? undefined,
      severity: String(row.severity),
      value: '1',
      acknowledged: row.acknowledged ? '1' : '0',
      hosts: row.hostid
        ? [
            {
              hostid: row.hostid,
              name: row.host_name?.trim() || row.hostid,
            },
          ]
        : [],
    }));

    const templateMap = new Map<
      string,
      { templateid: string; host: string; name: string; totalHosts: number }
    >();

    for (const host of detailedHosts) {
      const templates = host.parentTemplates ?? [];
      for (const template of templates as Array<{
        templateid?: string;
        host?: string;
        name?: string;
      }>) {
        if (!template?.templateid) continue;
        const existing = templateMap.get(template.templateid);
        if (existing) {
          existing.totalHosts += 1;
          continue;
        }
        templateMap.set(template.templateid, {
          templateid: template.templateid,
          host: template.host ?? template.templateid,
          name: template.name ?? template.host ?? template.templateid,
          totalHosts: 1,
        });
      }
    }

    const templates = Array.from(templateMap.values()).sort(
      (a, b) =>
        b.totalHosts - a.totalHosts || a.name.localeCompare(b.name, 'pt-BR'),
    );

    const overview = {
      group: groupName,
      totalHosts: detailedHosts.length,
      hostsAtivos: detailedHosts.filter((h) => h.status === '0').length,
      hostsInativos: detailedHosts.filter((h) => h.status === '1').length,
      problemasAbertos: 0,
      problemasAlta: 0,
      problemasMedia: 0,
    };

    const eventosCriticos = events.filter(
      (e) => Number(e.severity ?? 0) >= 4,
    ).length;
    const eventosMedios = events.filter(
      (e) => Number(e.severity ?? 0) === 3,
    ).length;

    const diffMs = endDate.getTime() - startDate.getTime();
    const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    const pack: ZabbixDashboardDetails = {
      overview,
      hosts: detailedHosts,
      templates,
      events,
      resumo: {
        totalTemplates: templates.length,
        totalEventos: events.length,
        eventosProblema: events.length,
        eventosRecuperacao: 0,
        eventosCriticos,
        eventosMedios,
      },
      periodo: {
        dias: days,
        de: Math.floor(startDate.getTime() / 1000),
        ate: Math.floor(endDate.getTime() / 1000),
      },
    };

    this.logger.debug(
      `Dashboard Zabbix via DB (${groupName}): ${events.length} eventos, ${detailedHosts.length} hosts`,
    );

    return { data: pack, usable: true };
  }
}
