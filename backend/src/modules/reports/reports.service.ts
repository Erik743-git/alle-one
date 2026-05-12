import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { TifluxService } from '../tiflux/tiflux.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { randomUUID } from 'crypto';
import { StreamableFile } from '@nestjs/common';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';

type ReportFormat = 'CSV' | 'PDF' | 'XLSX';
type ReportStatus = 'READY' | 'FAILED';

function parseDateOrThrow(value: string, label: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`${label} inválida`);
  }
  return d;
}

function normalizeRange(start: Date, end: Date) {
  const s = new Date(start);
  const e = new Date(end);
  s.setHours(0, 0, 0, 0);
  e.setHours(23, 59, 59, 999);
  if (e.getTime() < s.getTime()) {
    throw new BadRequestException(
      'Período inválido (data final < data inicial)',
    );
  }
  return { start: s, end: e };
}

function toDateOnlyISO(date: Date) {
  return date.toISOString().slice(0, 10);
}

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function safeFilenamePart(value: string) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 80);
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tiflux: TifluxService,
    private readonly dashboard: DashboardService,
  ) {}

  private async fetchChartPng(params: {
    chart: unknown;
    width?: number;
    height?: number;
    backgroundColor?: string;
  }): Promise<Buffer | null> {
    // ExcelJS não cria gráficos nativos; geramos o gráfico como imagem via QuickChart.
    // Se o ambiente bloquear saída HTTP, só omitimos o gráfico (o XLSX ainda sai com as tabelas).
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch('https://quickchart.io/chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          width: params.width ?? 1100,
          height: params.height ?? 380,
          backgroundColor: params.backgroundColor ?? 'white',
          format: 'png',
          chart: params.chart,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        return null;
      }
      const arr = await res.arrayBuffer();
      // Node 22 tipa Buffer como Buffer<ArrayBufferLike>; ExcelJS espera Buffer "clássico".
      return Buffer.from(arr) as unknown as Buffer;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private styleHeaderBand(sheet: ExcelJS.Worksheet, title: string) {
    sheet.mergeCells('A1:H1');
    sheet.getCell('A1').value = title;
    sheet.getCell('A1').font = {
      bold: true,
      size: 20,
      color: { argb: 'FF000000' },
    };
    sheet.getCell('A1').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF73D2F2' }, // azul claro do exemplo
    };
    sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(1).height = 36;
  }

  private styleTableHeader(row: ExcelJS.Row) {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0A2540' },
    };
    row.alignment = { vertical: 'middle', horizontal: 'center' };
    row.height = 20;
  }

  private styleTotalRow(row: ExcelJS.Row) {
    row.font = { bold: true, color: { argb: 'FFB91C1C' } }; // vermelho
  }

  private async generateTipo4Xlsx(params: {
    user: AuthenticatedRequestUser;
    companyId: string;
    start: Date;
    end: Date;
  }) {
    const company = await this.prisma.company.findFirst({
      where: { id: params.companyId, deletedAt: null },
      select: {
        id: true,
        name: true,
        zabbixGroupName: true,
        logoFile: { select: { path: true, mimeType: true } },
      },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    const group = company.zabbixGroupName?.trim() || 'ALLE-CLOUD';
    const startIso = params.start.toISOString();
    const endIso = params.end.toISOString();

    // Importante: o DashboardService faz override de companyId quando role === CLIENT.
    // Aqui o escopo já foi validado em `generateReport` (ensureCompanyInScope),
    // então forçamos role=ADMIN para garantir que o relatório use a empresa do filtro.
    const reportUser = {
      ...params.user,
      role: 'ADMIN' as AuthenticatedRequestUser['role'],
    };

    const dash = await this.dashboard.getCompleteDashboard(
      reportUser,
      { group, start: startIso, end: endIso, companyId: params.companyId },
      { includeHours: true },
    );

    const chamados = Array.isArray(dash.chamadosPorMes)
      ? dash.chamadosPorMes
      : [];
    const horas = Array.isArray(dash.horasPorMes) ? dash.horasPorMes : [];
    const alertas = Array.isArray(dash.alertasPorMes) ? dash.alertasPorMes : [];

    const withTotalRow = <T extends { monthLabel: string; [k: string]: any }>(
      rows: T[],
      keys: string[],
    ) => {
      const total: any = { monthLabel: 'Total', monthKey: 'TOTAL' };
      for (const k of keys) {
        total[k] = rows.reduce((acc, r) => acc + (Number(r[k]) || 0), 0);
      }
      return [...rows, total] as T[];
    };

    const chamadosRows = withTotalRow(chamados as any, [
      'Infraestrutura',
      'NOC',
      'Sistema',
      'Rotinas',
      'Total',
    ]);
    const horasRows = withTotalRow(horas as any, [
      'Infraestrutura',
      'NOC',
      'Sistema',
      'Rotinas',
      'Total',
    ]);
    const alertasRows = withTotalRow(alertas as any, [
      'High',
      'Disaster',
      'Total',
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Alle One';
    workbook.created = new Date();

    const addCompanyLogo = (sheet: ExcelJS.Worksheet) => {
      const logoPath = company.logoFile?.path?.trim() || null;
      if (!logoPath || !existsSync(logoPath)) return;
      const mime = (company.logoFile?.mimeType || '').toLowerCase();
      const ext = mime.includes('png')
        ? 'png'
        : mime.includes('jpg') || mime.includes('jpeg')
          ? 'jpeg'
          : null;
      if (!ext) return;
      const imageId = workbook.addImage({ filename: logoPath, extension: ext });
      sheet.addImage(imageId, {
        tl: { col: 5.8, row: 0.15 },
        ext: { width: 120, height: 40 },
      });
    };

    // Aba 1: Chamados por mês
    {
      const sheet = workbook.addWorksheet('Chamados por mês', {
        views: [{ state: 'frozen', ySplit: 6 }],
      });
      sheet.columns = [
        { key: 'monthLabel', width: 18 },
        { key: 'Infraestrutura', width: 16 },
        { key: 'NOC', width: 10 },
        { key: 'Sistema', width: 12 },
        { key: 'Rotinas', width: 12 },
        { key: 'Total', width: 10 },
      ];
      this.styleHeaderBand(sheet, 'Chamados Por Mês');
      addCompanyLogo(sheet);

      sheet.mergeCells('A3:F3');
      sheet.getCell('A3').value = 'Total de Chamados';
      sheet.getCell('A3').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0A2540' },
      };
      sheet.getCell('A3').font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getCell('A3').alignment = {
        horizontal: 'center',
        vertical: 'middle',
      };
      sheet.getRow(3).height = 20;

      const headerRow = sheet.getRow(4);
      headerRow.values = [
        'Mês',
        'Infraestrutura',
        'NOC',
        'Sistemas',
        'Rotinas',
        'Total',
      ];
      this.styleTableHeader(headerRow);

      let rowIdx = 5;
      for (const r of chamadosRows as any[]) {
        const row = sheet.getRow(rowIdx);
        row.values = [
          r.monthLabel,
          Number(r.Infraestrutura) || 0,
          Number(r.NOC) || 0,
          Number(r.Sistema) || 0,
          Number(r.Rotinas) || 0,
          Number(r.Total) || 0,
        ];
        row.alignment = { vertical: 'middle', horizontal: 'center' };
        if (r.monthLabel === 'Total') this.styleTotalRow(row);
        rowIdx += 1;
      }

      const chart = await this.fetchChartPng({
        width: 1100,
        height: 420,
        backgroundColor: 'white',
        chart: {
          type: 'bar',
          data: {
            labels: (chamadosRows as any[]).map((r) => r.monthLabel),
            datasets: [
              {
                label: 'Infraestrutura',
                data: (chamadosRows as any[]).map((r) => r.Infraestrutura),
                backgroundColor: '#4f8bd6',
              },
              {
                label: 'NOC',
                data: (chamadosRows as any[]).map((r) => r.NOC),
                backgroundColor: '#8c6fd1',
              },
              {
                label: 'Sistemas',
                data: (chamadosRows as any[]).map((r) => r.Sistema),
                backgroundColor: '#d85c57',
              },
              {
                label: 'Rotinas',
                data: (chamadosRows as any[]).map((r) => r.Rotinas),
                backgroundColor: '#9bc45b',
              },
              {
                label: 'Total',
                data: (chamadosRows as any[]).map((r) => r.Total),
                backgroundColor: '#57c1d9',
              },
            ],
          },
          options: {
            plugins: {
              legend: { position: 'top' },
              title: { display: true, text: 'TICKETS POR MÊS' },
            },
            scales: { y: { beginAtZero: true } },
          },
        },
      });
      if (chart) {
        const imageId = workbook.addImage({
          buffer: chart as any,
          extension: 'png',
        });
        sheet.addImage(imageId, {
          tl: { col: 0, row: rowIdx + 1 },
          ext: { width: 920, height: 350 },
        });
      }
    }

    // Aba 2: Apontamento de Horas
    {
      const sheet = workbook.addWorksheet('Apontamento de Horas', {
        views: [{ state: 'frozen', ySplit: 6 }],
      });
      sheet.columns = [
        { key: 'monthLabel', width: 18 },
        { key: 'Infraestrutura', width: 16 },
        { key: 'NOC', width: 10 },
        { key: 'Sistema', width: 12 },
        { key: 'Rotinas', width: 12 },
        { key: 'Total', width: 10 },
      ];
      this.styleHeaderBand(sheet, 'Apontamento de Horas');
      addCompanyLogo(sheet);

      sheet.mergeCells('A3:F3');
      sheet.getCell('A3').value = 'Total de Horas Apontadas';
      sheet.getCell('A3').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0A2540' },
      };
      sheet.getCell('A3').font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getCell('A3').alignment = {
        horizontal: 'center',
        vertical: 'middle',
      };
      sheet.getRow(3).height = 20;

      const headerRow = sheet.getRow(4);
      headerRow.values = [
        'Mês',
        'Infraestrutura',
        'NOC',
        'Sistemas',
        'Rotinas',
        'Total',
      ];
      this.styleTableHeader(headerRow);

      let rowIdx = 5;
      for (const r of horasRows as any[]) {
        const row = sheet.getRow(rowIdx);
        row.values = [
          r.monthLabel,
          Number(r.Infraestrutura) || 0,
          Number(r.NOC) || 0,
          Number(r.Sistema) || 0,
          Number(r.Rotinas) || 0,
          Number(r.Total) || 0,
        ];
        row.alignment = { vertical: 'middle', horizontal: 'center' };
        row.getCell(2).numFmt = '0.00';
        row.getCell(3).numFmt = '0.00';
        row.getCell(4).numFmt = '0.00';
        row.getCell(5).numFmt = '0.00';
        row.getCell(6).numFmt = '0.00';
        if (r.monthLabel === 'Total') this.styleTotalRow(row);
        rowIdx += 1;
      }

      const chart = await this.fetchChartPng({
        width: 1100,
        height: 420,
        backgroundColor: 'white',
        chart: {
          type: 'bar',
          data: {
            labels: (horasRows as any[]).map((r) => r.monthLabel),
            datasets: [
              {
                label: 'Infraestrutura',
                data: (horasRows as any[]).map((r) => r.Infraestrutura),
                backgroundColor: '#4f8bd6',
              },
              {
                label: 'NOC',
                data: (horasRows as any[]).map((r) => r.NOC),
                backgroundColor: '#8c6fd1',
              },
              {
                label: 'Sistemas',
                data: (horasRows as any[]).map((r) => r.Sistema),
                backgroundColor: '#d85c57',
              },
              {
                label: 'Rotinas',
                data: (horasRows as any[]).map((r) => r.Rotinas),
                backgroundColor: '#9bc45b',
              },
              {
                label: 'Total',
                data: (horasRows as any[]).map((r) => r.Total),
                backgroundColor: '#57c1d9',
              },
            ],
          },
          options: {
            plugins: {
              legend: { position: 'top' },
              title: { display: true, text: 'TICKETS POR MÊS' },
            },
            scales: { y: { beginAtZero: true } },
          },
        },
      });
      if (chart) {
        const imageId = workbook.addImage({
          buffer: chart as any,
          extension: 'png',
        });
        sheet.addImage(imageId, {
          tl: { col: 0, row: rowIdx + 1 },
          ext: { width: 920, height: 350 },
        });
      }
    }

    // Aba 3: Monitoramento
    {
      const sheet = workbook.addWorksheet('Monitoramento', {
        views: [{ state: 'frozen', ySplit: 6 }],
      });
      sheet.columns = [
        { key: 'monthLabel', width: 18 },
        { key: 'High', width: 12 },
        { key: 'Disaster', width: 12 },
        { key: 'Total', width: 12 },
      ];
      this.styleHeaderBand(sheet, 'Monitoramento');
      addCompanyLogo(sheet);

      sheet.mergeCells('A3:D3');
      sheet.getCell('A3').value = 'Total de Alertas por Mês';
      sheet.getCell('A3').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0A2540' },
      };
      sheet.getCell('A3').font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getCell('A3').alignment = {
        horizontal: 'center',
        vertical: 'middle',
      };
      sheet.getRow(3).height = 20;

      const headerRow = sheet.getRow(4);
      headerRow.values = ['Mês', 'High', 'Disaster', 'Total'];
      this.styleTableHeader(headerRow);

      let rowIdx = 5;
      for (const r of alertasRows as any[]) {
        const row = sheet.getRow(rowIdx);
        row.values = [
          r.monthLabel,
          Number(r.High) || 0,
          Number(r.Disaster) || 0,
          Number(r.Total) || 0,
        ];
        row.alignment = { vertical: 'middle', horizontal: 'center' };
        if (r.monthLabel === 'Total') this.styleTotalRow(row);
        rowIdx += 1;
      }

      const chart = await this.fetchChartPng({
        width: 1100,
        height: 420,
        backgroundColor: 'white',
        chart: {
          type: 'line',
          data: {
            labels: (alertasRows as any[]).map((r) => r.monthLabel),
            datasets: [
              {
                label: 'High',
                data: (alertasRows as any[]).map((r) => r.High),
                borderColor: '#4f8bd6',
                backgroundColor: 'rgba(79,139,214,0.15)',
                tension: 0.25,
                fill: false,
              },
              {
                label: 'Disaster',
                data: (alertasRows as any[]).map((r) => r.Disaster),
                borderColor: '#d85c57',
                backgroundColor: 'rgba(216,92,87,0.15)',
                tension: 0.25,
                fill: false,
              },
            ],
          },
          options: {
            plugins: {
              legend: { position: 'bottom' },
              title: { display: true, text: 'Alertas por Mês' },
            },
            scales: { y: { beginAtZero: true } },
          },
        },
      });
      if (chart) {
        const imageId = workbook.addImage({
          buffer: chart as any,
          extension: 'png',
        });
        sheet.addImage(imageId, {
          tl: { col: 0, row: rowIdx + 1 },
          ext: { width: 920, height: 350 },
        });
      }
    }

    // Metadados
    workbook.properties.date1904 = false;
    workbook.calcProperties.fullCalcOnLoad = true;

    return workbook.xlsx.writeBuffer();
  }

  private getAppointmentMinutes(appointment: {
    init_time?: string;
    end_time?: string;
  }) {
    if (!appointment.init_time || !appointment.end_time) {
      return 0;
    }

    const parseTime = (value: string) => {
      const parts = value.split(':').map((item) => Number(item));
      const [h, m, s] = [parts[0], parts[1], parts[2] ?? 0];
      return { h, m, s };
    };

    const start = parseTime(appointment.init_time);
    const end = parseTime(appointment.end_time);

    if (
      [start.h, start.m, start.s, end.h, end.m, end.s].some((v) =>
        Number.isNaN(v),
      )
    ) {
      return 0;
    }

    const startTotalSeconds = start.h * 3600 + start.m * 60 + start.s;
    const endTotalSeconds = end.h * 3600 + end.m * 60 + end.s;
    let diffSeconds = endTotalSeconds - startTotalSeconds;

    if (diffSeconds < 0) {
      diffSeconds += 24 * 3600;
    }

    if (diffSeconds <= 0) {
      return 0;
    }

    return Math.floor(diffSeconds / 60);
  }

  private async getHoursUsageRows(params: {
    companyId: string;
    start: Date;
    end: Date;
  }): Promise<Array<{ day: string; user: string; minutes: number }>> {
    const company = await this.prisma.company.findFirst({
      where: { id: params.companyId, deletedAt: null },
      select: { id: true, tifluxClientId: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');
    if (!company.tifluxClientId)
      throw new BadRequestException('Empresa sem tifluxClientId');

    const startDateOnly = toDateOnlyISO(params.start);
    const endDateOnly = toDateOnlyISO(params.end);

    // 1) Tentativa 100% banco (rápida)
    const dbRows =
      (await this.prisma.$queryRaw<
        Array<{ day: string; user_name: string | null; minutes: number }>
      >`
        select
          a.appointment_date::date::text as day,
          a.user_name,
          sum(
            case
              when a.init_time is null or a.end_time is null then 0
              when a.end_time >= a.init_time then extract(epoch from (a.end_time - a.init_time)) / 60
              else extract(epoch from (a.end_time + interval '24 hours' - a.init_time)) / 60
            end
          )::int as minutes
        from tiflux.ticket_appointments a
        inner join tiflux.tickets t
          on t.ticket_number = a.ticket_number
        where t.client_external_id = ${company.tifluxClientId}
          and a.appointment_date::date between ${startDateOnly}::date and ${endDateOnly}::date
        group by a.appointment_date::date, a.user_name
        order by a.appointment_date::date asc, a.user_name asc
      `) ?? [];

    if (dbRows.length) {
      return dbRows.map((r) => ({
        day: r.day,
        user: r.user_name ?? 'SEM_USUARIO',
        minutes: Number(r.minutes) || 0,
      }));
    }

    // 2) Fallback: chama API TiFlux e agrega em memória (e as chamadas ficam cacheadas em `external_api_cache`).
    // Observação: TiFlux não tem um endpoint único por "apontamentos no período" por cliente,
    // então buscamos tickets atualizados no intervalo e carregamos appointments por ticket.
    const tickets = await this.tiflux.getTickets({
      filter_by: 'all',
      client_ids: [company.tifluxClientId],
      update_start_datetime: params.start.toISOString(),
      update_end_datetime: params.end.toISOString(),
      limit: 200,
      offset: 1,
    });

    const byKey = new Map<
      string,
      { day: string; user: string; minutes: number }
    >();

    for (const t of tickets) {
      const appts = await this.tiflux.getTicketAppointmentsAll(
        t.ticket_number,
        {
          start_date: startDateOnly,
          end_date: endDateOnly,
          limit: 200,
        },
      );

      for (const a of appts) {
        const day = String(a.date ?? '').slice(0, 10);
        if (!day) continue;
        const user = a.user?.name?.trim() || 'SEM_USUARIO';
        const minutes = this.getAppointmentMinutes({
          init_time: a.init_time,
          end_time: a.end_time,
        });
        if (!minutes) continue;

        const key = `${day}::${user}`;
        const prev = byKey.get(key);
        if (prev) {
          prev.minutes += minutes;
        } else {
          byKey.set(key, { day, user, minutes });
        }
      }
    }

    return Array.from(byKey.values()).sort(
      (a, b) =>
        a.day.localeCompare(b.day) || a.user.localeCompare(b.user, 'pt-BR'),
    );
  }

  private async getAccessibleCompanyIds(
    user: AuthenticatedRequestUser,
  ): Promise<string[]> {
    if (user.role === 'CLIENT') {
      if (!user.companyId) {
        throw new ForbiddenException('Usuário CLIENT sem empresa vinculada');
      }
      return [user.companyId];
    }

    const companies = await this.prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    return companies.map((c) => c.id);
  }

  private ensureCompanyInScope(companyId: string, scopeCompanyIds: string[]) {
    if (!scopeCompanyIds.includes(companyId)) {
      throw new ForbiddenException('Sem acesso à empresa informada');
    }
  }

  async listCompaniesForReports(user: AuthenticatedRequestUser) {
    const scopeCompanyIds = await this.getAccessibleCompanyIds(user);

    const companies = await this.prisma.company.findMany({
      where: { id: { in: scopeCompanyIds }, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    return companies;
  }

  /**
   * Relatório exemplo: CSV de consumo de horas por empresa no período,
   * com base no cache TiFlux (schema `tiflux.*` no Postgres).
   */
  async generateHoursUsageCsv(params: {
    companyId: string;
    start: Date;
    end: Date;
  }) {
    if (!params.companyId?.trim()) {
      throw new BadRequestException('companyId é obrigatório');
    }

    const company = await this.prisma.company.findFirst({
      where: { id: params.companyId, deletedAt: null },
      select: { id: true, name: true, tifluxClientId: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');
    if (!company.tifluxClientId) {
      throw new BadRequestException('Empresa sem tifluxClientId');
    }

    const startDateOnly = toDateOnlyISO(params.start);
    const endDateOnly = toDateOnlyISO(params.end);

    const rows = await this.getHoursUsageRows({
      companyId: params.companyId,
      start: params.start,
      end: params.end,
    });

    const header = [
      'empresa',
      'periodo_inicio',
      'periodo_fim',
      'dia',
      'usuario',
      'minutos',
      'horas',
    ].join(',');
    const lines = rows.map((r) => {
      const hours = (Number(r.minutes) / 60).toFixed(2);
      return [
        escapeCsv(company.name),
        escapeCsv(startDateOnly),
        escapeCsv(endDateOnly),
        escapeCsv(r.day),
        escapeCsv(r.user),
        String(r.minutes),
        hours,
      ].join(',');
    });

    return [header, ...lines].join('\n');
  }

  async generateHoursUsageXlsx(params: {
    companyId: string;
    start: Date;
    end: Date;
    type: string;
  }) {
    const company = await this.prisma.company.findFirst({
      where: { id: params.companyId, deletedAt: null },
      select: {
        id: true,
        name: true,
        tifluxClientId: true,
        logoFile: { select: { path: true, mimeType: true } },
      },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');
    if (!company.tifluxClientId) {
      throw new BadRequestException('Empresa sem tifluxClientId');
    }

    const startDateOnly = toDateOnlyISO(params.start);
    const endDateOnly = toDateOnlyISO(params.end);

    const rows = await this.getHoursUsageRows({
      companyId: params.companyId,
      start: params.start,
      end: params.end,
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Alle One';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Relatório', {
      views: [{ state: 'frozen', ySplit: 7 }],
    });

    // Cabeçalho + logo
    sheet.getColumn(1).width = 16;
    sheet.getColumn(2).width = 14;
    sheet.getColumn(3).width = 14;
    sheet.getColumn(4).width = 14;
    sheet.getColumn(5).width = 28;
    sheet.getColumn(6).width = 12;
    sheet.getColumn(7).width = 12;

    sheet.mergeCells('A1:E1');
    sheet.getCell('A1').value = `Relatório (Tipo ${params.type})`;
    sheet.getCell('A1').font = {
      bold: true,
      size: 16,
      color: { argb: 'FFFFFFFF' },
    };
    sheet.getCell('A1').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF08182F' },
    };
    sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(1).height = 28;

    sheet.getCell('A2').value = 'Empresa:';
    sheet.getCell('B2').value = company.name;
    sheet.getCell('A3').value = 'Período:';
    sheet.getCell('B3').value = `${startDateOnly} até ${endDateOnly}`;
    sheet.getCell('A4').value = 'Gerado em:';
    sheet.getCell('B4').value = new Date()
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');

    ['A2', 'A3', 'A4'].forEach((addr) => {
      sheet.getCell(addr).font = { bold: true };
    });

    // Logo (se existir)
    const logoPath = company.logoFile?.path?.trim() || null;
    if (logoPath && existsSync(logoPath)) {
      const mime = (company.logoFile?.mimeType || '').toLowerCase();
      const ext = mime.includes('png')
        ? 'png'
        : mime.includes('jpg') || mime.includes('jpeg')
          ? 'jpeg'
          : null;
      if (ext) {
        const imageId = workbook.addImage({
          filename: logoPath,
          extension: ext,
        });
        // posiciona no canto superior direito
        sheet.addImage(imageId, {
          tl: { col: 5.2, row: 0.2 },
          ext: { width: 120, height: 40 },
        });
      }
    }

    // Tabela
    const headerRowIndex = 7;
    const header = [
      'Empresa',
      'Início',
      'Fim',
      'Dia',
      'Usuário',
      'Minutos',
      'Horas',
    ];
    sheet.getRow(headerRowIndex).values = header;
    sheet.getRow(headerRowIndex).font = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    sheet.getRow(headerRowIndex).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0A2540' },
    };
    sheet.getRow(headerRowIndex).alignment = { vertical: 'middle' };
    sheet.getRow(headerRowIndex).height = 20;

    let rowIndex = headerRowIndex + 1;
    for (const r of rows) {
      const minutes = Number(r.minutes) || 0;
      const hours = Number((minutes / 60).toFixed(2));
      sheet.getRow(rowIndex).values = [
        company.name,
        startDateOnly,
        endDateOnly,
        r.day,
        r.user,
        minutes,
        hours,
      ];
      sheet.getRow(rowIndex).getCell(6).numFmt = '0';
      sheet.getRow(rowIndex).getCell(7).numFmt = '0.00';
      rowIndex += 1;
    }

    sheet.autoFilter = {
      from: { row: headerRowIndex, column: 1 },
      to: { row: headerRowIndex, column: 7 },
    };

    return workbook.xlsx.writeBuffer();
  }

  async listReports(
    user: AuthenticatedRequestUser,
    query: {
      companyId?: string;
      type?: string;
      start?: string;
      end?: string;
    },
  ) {
    const scopeCompanyIds = await this.getAccessibleCompanyIds(user);

    const companyId = query.companyId?.trim() || null;
    if (companyId) {
      this.ensureCompanyInScope(companyId, scopeCompanyIds);
    }

    const start = query.start
      ? parseDateOrThrow(query.start, 'Data inicial')
      : null;
    const end = query.end ? parseDateOrThrow(query.end, 'Data final') : null;
    const normalized = start && end ? normalizeRange(start, end) : null;

    return this.prisma.report.findMany({
      where: {
        companyId: companyId ? companyId : { in: scopeCompanyIds },
        ...(query.type?.trim() ? { type: query.type.trim() } : {}),
        ...(normalized
          ? {
              periodStart: { gte: normalized.start },
              periodEnd: { lte: normalized.end },
            }
          : {}),
      },
      include: {
        company: { select: { id: true, name: true } },
        file: {
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            size: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getLastReport(
    user: AuthenticatedRequestUser,
    query: { companyId?: string; type?: string },
  ) {
    const scopeCompanyIds = await this.getAccessibleCompanyIds(user);
    const companyId = query.companyId?.trim() || null;
    if (companyId) {
      this.ensureCompanyInScope(companyId, scopeCompanyIds);
    }

    return this.prisma.report.findFirst({
      where: {
        companyId: companyId ? companyId : { in: scopeCompanyIds },
        ...(query.type?.trim() ? { type: query.type.trim() } : {}),
      },
      include: {
        company: { select: { id: true, name: true } },
        file: {
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            size: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async generateReport(
    user: AuthenticatedRequestUser,
    payload: {
      companyId: string;
      type: string;
      format: ReportFormat;
      start: string;
      end: string;
    },
  ) {
    const scopeCompanyIds = await this.getAccessibleCompanyIds(user);
    const companyId = payload.companyId?.trim();
    if (!companyId) throw new BadRequestException('companyId é obrigatório');
    this.ensureCompanyInScope(companyId, scopeCompanyIds);

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    const type = payload.type?.trim();
    if (!type) throw new BadRequestException('type é obrigatório');

    const format = (payload.format?.trim().toUpperCase() ||
      'CSV') as ReportFormat;
    if (!['CSV', 'PDF', 'XLSX'].includes(format)) {
      throw new BadRequestException('format inválido (use CSV, PDF ou XLSX)');
    }

    if (format === 'PDF') {
      throw new BadRequestException(
        'Formato ainda não suportado. Use CSV ou XLSX por enquanto.',
      );
    }

    const start = parseDateOrThrow(payload.start, 'Data inicial');
    const end = parseDateOrThrow(payload.end, 'Data final');
    const range = normalizeRange(start, end);

    const reportId = randomUUID();

    const uploadsDir = join(process.cwd(), 'uploads', 'reports', reportId);
    mkdirSync(uploadsDir, { recursive: true });

    const companyPart = safeFilenamePart(company.name) || 'empresa';
    const typePart = `tipo-${safeFilenamePart(type) || 'x'}`;
    const startPart = toDateOnlyISO(range.start);
    const endPart = toDateOnlyISO(range.end);
    const baseName = `${companyPart}-${typePart}-${startPart}-a-${endPart}`;

    const built =
      format === 'XLSX'
        ? {
            filename: `${baseName}.xlsx`,
            mimeType:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buffer: Buffer.from(
              type === '4'
                ? await this.generateTipo4Xlsx({
                    user,
                    companyId,
                    start: range.start,
                    end: range.end,
                  })
                : await this.generateHoursUsageXlsx({
                    companyId,
                    start: range.start,
                    end: range.end,
                    type,
                  }),
            ),
          }
        : {
            filename: `${baseName}.csv`,
            mimeType: 'text/csv',
            buffer: Buffer.from(
              await this.generateHoursUsageCsv({
                companyId,
                start: range.start,
                end: range.end,
              }),
              'utf8',
            ),
          };

    const targetPath = join(uploadsDir, built.filename);
    writeFileSync(targetPath, built.buffer);

    const file = await this.prisma.file.create({
      data: {
        originalName: built.filename,
        mimeType: built.mimeType,
        path: targetPath,
        size: built.buffer.length,
        uploadedBy: user.userId,
      },
    });

    const report = await this.prisma.report.create({
      data: {
        id: reportId,
        companyId,
        type,
        format,
        status: 'READY' as ReportStatus,
        periodStart: range.start,
        periodEnd: range.end,
        filters: {
          companyId,
          type,
          format,
          start: range.start.toISOString(),
          end: range.end.toISOString(),
        },
        generatedBy: user.userId,
        fileId: file.id,
      },
      include: {
        company: { select: { id: true, name: true } },
        file: {
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            size: true,
            createdAt: true,
          },
        },
      },
    });

    return report;
  }

  async downloadReport(user: AuthenticatedRequestUser, reportId: string) {
    const scopeCompanyIds = await this.getAccessibleCompanyIds(user);

    const report = await this.prisma.report.findFirst({
      where: { id: reportId },
      include: {
        company: { select: { id: true, name: true } },
        file: { select: { originalName: true, mimeType: true, path: true } },
      },
    });

    if (!report) throw new NotFoundException('Relatório não encontrado');
    this.ensureCompanyInScope(report.companyId, scopeCompanyIds);

    if (!report.file) throw new NotFoundException('Arquivo não encontrado');
    if (!existsSync(report.file.path)) {
      throw new NotFoundException('Arquivo não encontrado no servidor');
    }

    const companyPart =
      safeFilenamePart(report.company?.name ?? '') || 'empresa';
    const typePart = `tipo-${safeFilenamePart(report.type ?? '') || 'x'}`;
    const startPart = toDateOnlyISO(new Date(report.periodStart));
    const endPart = toDateOnlyISO(new Date(report.periodEnd));
    const ext = report.format?.toLowerCase?.() === 'xlsx' ? 'xlsx' : 'csv';
    const downloadName = `${companyPart}-${typePart}-${startPart}-a-${endPart}.${ext}`;

    return {
      file: new StreamableFile(createReadStream(report.file.path)),
      meta: {
        originalName: downloadName,
        mimeType: report.file.mimeType || 'application/octet-stream',
      },
    };
  }
}
