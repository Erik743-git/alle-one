import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ReportFormat, ReportStatus, ReportType } from '@prisma/client';
import { mapWithConcurrency } from '../../common/concurrency.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { TifluxService } from '../tiflux/tiflux.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { randomUUID } from 'crypto';
import { StreamableFile } from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { writeUploadedBuffer } from '../../common/upload/local-file.helper';
import { join } from 'path';
import ExcelJS from 'exceljs';
import { isMonitoringPeriodWeekly } from '../../common/monitoring-period';
import {
  analyzeRendimentoDay,
  overtimeKindFromValorization,
} from '../rendimento/rendimento-day-insights';
import { computeUnionWorkedMinutes } from '../rendimento/rendimento-worked-minutes.helper';
import { RendimentoService } from '../rendimento/rendimento.service';
import { buildTipo4ReportCsv } from './reports-tipo4-csv';

import { toReportFormat, toReportType } from './reports-type.helper';

const ALLOWED_REPORT_TYPES = new Set(['1', '4']);
const ALL_COMPANIES_REPORT_ID = '__all__';

const REPORT_TYPE_LABELS: Record<string, string> = {
  '1': 'Rendimento',
  '4': 'Estatística Geral',
};

const REPORT_TYPE_SLUGS: Record<string, string> = {
  '1': 'rendimento',
  '4': 'estatistica-geral',
};

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

function normalizeNameKey(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tiflux: TifluxService,
    private readonly dashboard: DashboardService,
    private readonly rendimento: RendimentoService,
  ) {}

  private async fetchChartPng(params: {
    chart: unknown;
    plugins?: string[];
    width?: number;
    height?: number;
    backgroundColor?: string;
  }): Promise<Buffer | null> {
    // ExcelJS não cria gráficos nativos; geramos o gráfico como imagem via QuickChart.
    // Se o ambiente bloquear saída HTTP, só omitimos o gráfico (o XLSX ainda sai com as tabelas).
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35_000);
    try {
      const res = await fetch('https://quickchart.io/chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          width: params.width ?? 900,
          height: params.height ?? 320,
          devicePixelRatio: 1,
          backgroundColor: params.backgroundColor ?? 'white',
          format: 'png',
          // Padrão do QuickChart é Chart.js v2; nossos scales/plugins são v3+.
          version: '3.9.1',
          chart: params.chart,
          ...(params.plugins?.length ? { plugins: params.plugins } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(
          `QuickChart retornou HTTP ${res.status}; gráfico omitido do XLSX.`,
        );
        return null;
      }
      const arr = await res.arrayBuffer();
      // Node 22 tipa Buffer como Buffer<ArrayBufferLike>; ExcelJS espera Buffer "clássico".
      return Buffer.from(arr) as unknown as Buffer;
    } catch (err) {
      this.logger.warn(
        `Falha ao gerar gráfico QuickChart: ${err instanceof Error ? err.message : err}`,
      );
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

  /** Paleta e layout da Estatística Geral (modelo Alle WhatsApp). */
  private readonly tipo4Theme = {
    titleBand: 'FF9DC3E6',
    tableTitle: 'FF1F3864',
    colHeader: 'FF4472C4',
    rowAlt: 'FFD9E2F3',
    border: 'FFB4C6E7',
    infra: '#4472C4',
    noc: '#C00000',
    sistemas: '#548235',
    rotinas: '#7030A0',
    consult: '#ED7D31',
    totalCyan: '#00B0F0',
    high: '#4472C4',
    disaster: '#C00000',
  };

  private splitTipo4MonthRows<T extends { monthLabel: string }>(rows: T[]) {
    const months = rows.filter((r) => r.monthLabel !== 'Total');
    const total = rows.find((r) => r.monthLabel === 'Total') ?? null;
    return { months, total };
  }

  private formatTipo4PeriodLabel(start: Date, end: Date) {
    const fmt = (d: Date) =>
      d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    return `${fmt(start)} — ${fmt(end)}`;
  }

  private sumTipo4Keys(
    rows: Array<Record<string, unknown>>,
    keys: string[],
  ): Record<string, number> {
    const total: Record<string, number> = { monthLabel: 'Total' } as any;
    for (const k of keys) {
      total[k] = rows.reduce((acc, r) => acc + (Number(r[k]) || 0), 0);
    }
    return total;
  }

  private styleTipo4TitleBand(sheet: ExcelJS.Worksheet, title: string, colSpan: number) {
    const lastCol = String.fromCharCode(64 + colSpan);
    sheet.mergeCells(`A1:${lastCol}1`);
    const cell = sheet.getCell('A1');
    cell.value = title;
    cell.font = { bold: true, size: 22, color: { argb: 'FF000000' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: this.tipo4Theme.titleBand },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    sheet.getRow(1).height = 40;
  }

  private styleTipo4TableTitleRow(
    sheet: ExcelJS.Worksheet,
    title: string,
    colSpan: number,
    rowNumber = 3,
  ) {
    const lastCol = String.fromCharCode(64 + colSpan);
    const rowRef = `A${rowNumber}:${lastCol}${rowNumber}`;
    sheet.mergeCells(rowRef);
    const cell = sheet.getCell(`A${rowNumber}`);
    cell.value = title;
    cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: this.tipo4Theme.tableTitle },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(rowNumber).height = 22;
  }

  private styleTipo4ColumnHeaderRow(row: ExcelJS.Row, colCount: number) {
    row.height = 20;
    for (let c = 1; c <= colCount; c += 1) {
      const cell = row.getCell(c);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: this.tipo4Theme.colHeader },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: this.tipo4Theme.border } },
        bottom: { style: 'thin', color: { argb: this.tipo4Theme.border } },
        left: { style: 'thin', color: { argb: this.tipo4Theme.border } },
        right: { style: 'thin', color: { argb: this.tipo4Theme.border } },
      };
    }
  }

  private styleTipo4DataRow(
    row: ExcelJS.Row,
    rowIndex: number,
    colCount: number,
    options?: { minHeight?: number },
  ) {
    const fillArgb =
      rowIndex % 2 === 0 ? 'FFFFFFFF' : this.tipo4Theme.rowAlt;
    row.alignment = { vertical: 'middle', horizontal: 'center' };
    row.height = options?.minHeight ?? 18;
    for (let c = 1; c <= colCount; c += 1) {
      const cell = row.getCell(c);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: fillArgb },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: this.tipo4Theme.border } },
        bottom: { style: 'thin', color: { argb: this.tipo4Theme.border } },
        left: { style: 'thin', color: { argb: this.tipo4Theme.border } },
        right: { style: 'thin', color: { argb: this.tipo4Theme.border } },
      };
    }
  }

  private tipo4SeverityFont(severity: string): Partial<ExcelJS.Font> {
    return {
      bold: true,
      color: {
        argb: severity === 'Disaster' ? 'FFC00000' : 'FF806000',
      },
    };
  }

  private writeTipo4TopTriggersSheet(params: {
    sheet: ExcelJS.Worksheet;
    companyName: string;
    group: string;
    periodLabel: string;
    dashSummary: Record<string, unknown> | undefined;
    topTriggers: Array<{
      host: string;
      trigger: string;
      severity: string;
      count: number;
    }>;
    principaisHosts: Array<{
      monthLabel: string;
      High: Array<{ host: string; quantity: number }>;
      Disaster: Array<{ host: string; quantity: number }>;
    }>;
    addCompanyLogo: (sheet: ExcelJS.Worksheet) => void;
  }) {
    const {
      sheet,
      companyName,
      group,
      periodLabel,
      dashSummary,
      topTriggers,
      principaisHosts,
      addCompanyLogo,
    } = params;

    const colCount = 5;
    const lastCol = String.fromCharCode(64 + colCount);

    const totalHosts = Number(dashSummary?.totalHosts) || 0;
    const totalHigh = Number(dashSummary?.totalHigh) || 0;
    const totalDisaster = Number(dashSummary?.totalDisaster) || 0;
    const totalAlerts = totalHigh + totalDisaster;
    const uniqueTriggers =
      Number(dashSummary?.totalTriggersDistintos) || topTriggers.length;
    const top10 = topTriggers.slice(0, 10);

    this.styleTipo4TitleBand(
      sheet,
      `Top Triggers — ${companyName}`,
      colCount,
    );
    addCompanyLogo(sheet);

    sheet.mergeCells(`A2:${lastCol}2`);
    const sub = sheet.getCell('A2');
    sub.value = `Grupo Zabbix: ${group}  •  Período: ${periodLabel}`;
    sub.font = { size: 11, italic: true, color: { argb: 'FF333333' } };
    sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    sheet.getRow(2).height = 22;

    this.styleTipo4TableTitleRow(sheet, 'Resumo do período', colCount, 3);

    const kpiHeader = sheet.getRow(4);
    kpiHeader.values = [
      'Hosts no grupo',
      'Triggers distintos',
      'Total alertas',
      'High',
      'Disaster',
    ];
    this.styleTipo4ColumnHeaderRow(kpiHeader, colCount);

    const kpiValues = sheet.getRow(5);
    kpiValues.values = [
      totalHosts,
      uniqueTriggers,
      totalAlerts,
      totalHigh,
      totalDisaster,
    ];
    kpiValues.height = 30;
    for (let c = 1; c <= colCount; c += 1) {
      const cell = kpiValues.getCell(c);
      cell.font = { bold: true, size: 16, color: { argb: 'FF1F3864' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8F0FA' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: this.tipo4Theme.border } },
        bottom: { style: 'thin', color: { argb: this.tipo4Theme.border } },
        left: { style: 'thin', color: { argb: this.tipo4Theme.border } },
        right: { style: 'thin', color: { argb: this.tipo4Theme.border } },
      };
    }

    let rowIdx = 7;
    this.styleTipo4TableTitleRow(sheet, 'Top 10 triggers', colCount, rowIdx);
    rowIdx += 1;

    const trigHeader = sheet.getRow(rowIdx);
    trigHeader.values = ['#', 'Host', 'Trigger', 'Severidade', 'Alertas'];
    this.styleTipo4ColumnHeaderRow(trigHeader, colCount);
    rowIdx += 1;

    for (let i = 0; i < top10.length; i += 1) {
      const t = top10[i];
      const row = sheet.getRow(rowIdx);
      row.values = [i + 1, t.host, t.trigger, t.severity, t.count];
      this.styleTipo4DataRow(row, i, colCount, { minHeight: 22 });
      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(2).alignment = { horizontal: 'left', indent: 1, wrapText: false };
      row.getCell(3).font = { size: 9 };
      row.getCell(3).alignment = {
        horizontal: 'left',
        vertical: 'middle',
        wrapText: true,
      };
      row.getCell(4).font = this.tipo4SeverityFont(t.severity);
      row.getCell(4).alignment = { horizontal: 'center' };
      row.getCell(5).font = { bold: true };
      row.getCell(5).alignment = { horizontal: 'center' };
      rowIdx += 1;
    }

    if (principaisHosts.length > 0) {
      rowIdx += 1;
      this.styleTipo4TableTitleRow(
        sheet,
        'Principais hosts por mês (top 3 por severidade)',
        colCount,
        rowIdx,
      );
      rowIdx += 1;

      const hostsHeader = sheet.getRow(rowIdx);
      hostsHeader.values = ['Mês', 'Host', 'Severidade', '#', 'Alertas'];
      this.styleTipo4ColumnHeaderRow(hostsHeader, colCount);
      rowIdx += 1;

      let zebra = 0;
      for (const m of principaisHosts) {
        const entries: Array<{
          pos: number;
          severity: string;
          host: string;
          qty: number;
        }> = [];
        (m.High ?? []).slice(0, 3).forEach((h, idx) => {
          entries.push({
            pos: idx + 1,
            severity: 'High',
            host: h.host,
            qty: h.quantity,
          });
        });
        (m.Disaster ?? []).slice(0, 3).forEach((h, idx) => {
          entries.push({
            pos: idx + 1,
            severity: 'Disaster',
            host: h.host,
            qty: h.quantity,
          });
        });

        if (entries.length === 0) {
          const row = sheet.getRow(rowIdx);
          row.values = [m.monthLabel, '—', '—', '—', '—'];
          this.styleTipo4DataRow(row, zebra, colCount);
          row.getCell(1).alignment = { horizontal: 'left', indent: 1 };
          row.getCell(2).alignment = { horizontal: 'left', indent: 1 };
          zebra += 1;
          rowIdx += 1;
          continue;
        }

        const blockStart = rowIdx;
        for (let j = 0; j < entries.length; j += 1) {
          const e = entries[j];
          const row = sheet.getRow(rowIdx);
          row.values = [
            j === 0 ? m.monthLabel : '',
            e.host,
            e.severity,
            e.pos,
            e.qty,
          ];
          this.styleTipo4DataRow(row, zebra, colCount);
          row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
          row.getCell(2).alignment = {
            horizontal: 'left',
            indent: 1,
            wrapText: true,
            vertical: 'middle',
          };
          row.getCell(3).font = this.tipo4SeverityFont(e.severity);
          row.getCell(3).alignment = { horizontal: 'center' };
          row.getCell(4).alignment = { horizontal: 'center' };
          row.getCell(5).alignment = { horizontal: 'center' };
          row.getCell(5).font = { bold: true };
          zebra += 1;
          rowIdx += 1;
        }

        if (entries.length > 1) {
          sheet.mergeCells(`A${blockStart}:A${rowIdx - 1}`);
          sheet.getCell(`A${blockStart}`).alignment = {
            vertical: 'middle',
            horizontal: 'left',
            wrapText: false,
            indent: 1,
          };
        }
      }
    }

    sheet.getColumn(1).width = 22;
    sheet.getColumn(2).width = 48;
    sheet.getColumn(3).width = 14;
    sheet.getColumn(4).width = 8;
    sheet.getColumn(5).width = 10;

    sheet.views = [{ state: 'frozen', ySplit: 3, activeCell: 'A4' }];
  }

  private writeTipo4AllTriggersSheet(params: {
    sheet: ExcelJS.Worksheet;
    companyName: string;
    group: string;
    periodLabel: string;
    rows: Array<{
      host: string;
      trigger: string;
      severity: string;
      count: number;
    }>;
    addCompanyLogo: (sheet: ExcelJS.Worksheet) => void;
  }) {
    const { sheet, companyName, group, periodLabel, rows, addCompanyLogo } =
      params;
    const colCount = 5;
    const lastCol = String.fromCharCode(64 + colCount);

    this.styleTipo4TitleBand(
      sheet,
      `Triggers do período — ${companyName}`,
      colCount,
    );
    addCompanyLogo(sheet);

    sheet.mergeCells(`A2:${lastCol}2`);
    const sub = sheet.getCell('A2');
    sub.value = `Grupo Zabbix: ${group}  •  Período: ${periodLabel}  •  ${rows.length} linha(s)`;
    sub.font = { size: 11, italic: true, color: { argb: 'FF333333' } };
    sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    sheet.getRow(2).height = 22;

    const headerRow = sheet.getRow(4);
    headerRow.values = ['#', 'Host', 'Trigger', 'Severidade', 'Alertas'];
    this.styleTipo4ColumnHeaderRow(headerRow, colCount);

    let rowIdx = 5;
    for (let i = 0; i < rows.length; i += 1) {
      const t = rows[i];
      const row = sheet.getRow(rowIdx);
      row.values = [i + 1, t.host, t.trigger, t.severity, t.count];
      this.styleTipo4DataRow(row, i, colCount, { minHeight: 20 });
      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(2).alignment = { horizontal: 'left', indent: 1, wrapText: false };
      row.getCell(3).font = { size: 9 };
      row.getCell(3).alignment = {
        horizontal: 'left',
        vertical: 'middle',
        wrapText: true,
      };
      row.getCell(4).font = this.tipo4SeverityFont(t.severity);
      row.getCell(4).alignment = { horizontal: 'center' };
      row.getCell(5).alignment = { horizontal: 'center' };
      row.getCell(5).font = { bold: true };
      rowIdx += 1;
    }

    sheet.getColumn(1).width = 8;
    sheet.getColumn(2).width = 34;
    sheet.getColumn(3).width = 48;
    sheet.getColumn(4).width = 12;
    sheet.getColumn(5).width = 10;
    sheet.views = [{ state: 'frozen', ySplit: 4, activeCell: 'A5' }];
  }

  private async getTipo4TicketsStats(params: {
    tifluxClientId: number;
    start: Date;
    end: Date;
  }): Promise<{
    openedInPeriod: number;
    closedInPeriod: number;
    openNowTotal: number;
    ticketsBaseTotal: number;
    openTickets: Array<{
      ticketNumber: number;
      title: string | null;
      responsibleName: string | null;
      deskName: string | null;
      statusName: string | null;
      updatedAtSource: string | null;
    }>;
  }> {
    const [summary] =
      (await this.prisma.$queryRaw<
        Array<{
          opened_in_period: number;
          closed_in_period: number;
          open_now_total: number;
          tickets_base_total: number;
        }>
      >`
      select
        count(*) filter (
          where t.created_at_source is not null
            and t.created_at_source between ${params.start.toISOString()}::timestamptz and ${params.end.toISOString()}::timestamptz
        )::int as opened_in_period,
        count(*) filter (
          where coalesce(t.is_closed, false) = true
            and t.updated_at_source is not null
            and t.updated_at_source between ${params.start.toISOString()}::timestamptz and ${params.end.toISOString()}::timestamptz
        )::int as closed_in_period,
        count(*) filter (where coalesce(t.is_closed, false) = false)::int as open_now_total,
        count(*)::int as tickets_base_total
      from tiflux.tickets t
      where t.client_external_id = ${params.tifluxClientId}
    `) ?? [];

    const openRows =
      (await this.prisma.$queryRaw<
        Array<{
          ticket_number: number;
          title: string | null;
          responsible_name: string | null;
          desk_name: string | null;
          status_name: string | null;
          updated_at_source: string | null;
        }>
      >`
      select
        t.ticket_number,
        t.title,
        t.responsible_name,
        t.desk_name,
        t.status_name,
        t.updated_at_source::text as updated_at_source
      from tiflux.tickets t
      where t.client_external_id = ${params.tifluxClientId}
        and coalesce(t.is_closed, false) = false
      order by t.updated_at_source desc nulls last, t.ticket_number asc
    `) ?? [];

    return {
      openedInPeriod: Number(summary?.opened_in_period) || 0,
      closedInPeriod: Number(summary?.closed_in_period) || 0,
      openNowTotal: Number(summary?.open_now_total) || 0,
      ticketsBaseTotal: Number(summary?.tickets_base_total) || 0,
      openTickets: openRows.map((r) => ({
        ticketNumber: Number(r.ticket_number),
        title: r.title,
        responsibleName: r.responsible_name,
        deskName: r.desk_name,
        statusName: r.status_name,
        updatedAtSource: r.updated_at_source,
      })),
    };
  }

  private async writeTipo4TicketsSheet(params: {
    workbook: ExcelJS.Workbook;
    sheet: ExcelJS.Worksheet;
    companyName: string;
    periodLabel: string;
    stats: {
      openedInPeriod: number;
      closedInPeriod: number;
      openNowTotal: number;
      ticketsBaseTotal: number;
      openTickets: Array<{
        ticketNumber: number;
        title: string | null;
        responsibleName: string | null;
        deskName: string | null;
        statusName: string | null;
        updatedAtSource: string | null;
      }>;
    };
    addCompanyLogo: (sheet: ExcelJS.Worksheet) => void;
  }) {
    const { workbook, sheet, companyName, periodLabel, stats, addCompanyLogo } =
      params;
    const colCount = 6;
    const lastCol = String.fromCharCode(64 + colCount);

    this.styleTipo4TitleBand(sheet, `Chamados — ${companyName}`, colCount);
    addCompanyLogo(sheet);

    sheet.mergeCells(`A2:${lastCol}2`);
    const sub = sheet.getCell('A2');
    sub.value = `Período de análise: ${periodLabel}`;
    sub.font = { size: 11, italic: true, color: { argb: 'FF333333' } };
    sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    sheet.getRow(2).height = 22;

    this.styleTipo4TableTitleRow(sheet, 'Resumo de chamados', colCount, 3);
    const headerRow = sheet.getRow(4);
    headerRow.values = [
      'Abertos no período',
      'Fechados no período',
      'Em aberto (geral)',
      'Base de tickets',
      '',
      '',
    ];
    this.styleTipo4ColumnHeaderRow(headerRow, colCount);
    sheet.mergeCells('D4:F4');
    sheet.getCell('D4').alignment = { vertical: 'middle', horizontal: 'center' };

    const valuesRow = sheet.getRow(5);
    valuesRow.values = [
      stats.openedInPeriod,
      stats.closedInPeriod,
      stats.openNowTotal,
      stats.ticketsBaseTotal,
      '',
      '',
    ];
    valuesRow.height = 30;
    for (let c = 1; c <= colCount; c += 1) {
      const cell = valuesRow.getCell(c);
      cell.font = { bold: true, size: 16, color: { argb: 'FF1F3864' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8F0FA' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: this.tipo4Theme.border } },
        bottom: { style: 'thin', color: { argb: this.tipo4Theme.border } },
        left: { style: 'thin', color: { argb: this.tipo4Theme.border } },
        right: { style: 'thin', color: { argb: this.tipo4Theme.border } },
      };
    }
    sheet.mergeCells('D5:F5');
    sheet.getCell('D5').alignment = { vertical: 'middle', horizontal: 'center' };

    await this.embedTipo4Chart(
      workbook,
      sheet,
      7,
      this.buildTipo4GroupedBarChart({
        title: 'Abertos/Fechados no período + Em aberto geral',
        labels: ['Abertos (período)', 'Fechados (período)', 'Em aberto (geral)'],
        datasets: [
          {
            label: 'Chamados',
            data: [
              stats.openedInPeriod,
              stats.closedInPeriod,
              stats.openNowTotal,
            ],
            backgroundColor: this.tipo4Theme.infra,
          },
        ],
      }),
    );

    let rowIdx = 22;
    this.styleTipo4TableTitleRow(
      sheet,
      `Chamados em aberto (geral) — ${stats.openTickets.length} registro(s)`,
      colCount,
      rowIdx,
    );
    rowIdx += 1;

    const openHeader = sheet.getRow(rowIdx);
    openHeader.values = [
      'Ticket',
      'Título',
      'Responsável',
      'Mesa',
      'Status',
      'Última atualização',
    ];
    this.styleTipo4ColumnHeaderRow(openHeader, colCount);
    rowIdx += 1;

    for (let i = 0; i < stats.openTickets.length; i += 1) {
      const t = stats.openTickets[i];
      const row = sheet.getRow(rowIdx);
      row.values = [
        t.ticketNumber,
        t.title ?? '—',
        t.responsibleName ?? '—',
        t.deskName ?? '—',
        t.statusName ?? '—',
        t.updatedAtSource
          ? new Date(t.updatedAtSource).toLocaleString('pt-BR')
          : '—',
      ];
      this.styleTipo4DataRow(row, i, colCount, { minHeight: 20 });
      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(2).alignment = { horizontal: 'left', indent: 1, wrapText: true };
      row.getCell(3).alignment = { horizontal: 'left', indent: 1 };
      row.getCell(4).alignment = { horizontal: 'left', indent: 1 };
      row.getCell(5).alignment = { horizontal: 'center' };
      row.getCell(6).alignment = { horizontal: 'center' };
      rowIdx += 1;
    }

    if (stats.openTickets.length === 0) {
      const row = sheet.getRow(rowIdx);
      row.values = ['—', 'Nenhum chamado em aberto.', '—', '—', '—', '—'];
      this.styleTipo4DataRow(row, 0, colCount);
      row.getCell(2).alignment = { horizontal: 'left', indent: 1 };
    }

    sheet.getColumn(1).width = 12;
    sheet.getColumn(2).width = 46;
    sheet.getColumn(3).width = 24;
    sheet.getColumn(4).width = 20;
    sheet.getColumn(5).width = 14;
    sheet.getColumn(6).width = 22;
    sheet.views = [{ state: 'frozen', ySplit: 5, activeCell: 'A6' }];
  }

  private tipo4ChartPlugins() {
    return ['chartjs-plugin-datalabels'];
  }

  private tipo4DatalabelsPlugin() {
    return {
      datalabels: {
        anchor: 'end',
        align: 'top',
        offset: 4,
        clip: false,
        color: '#333333',
        font: { size: 11, weight: 'bold' },
        formatter: (value: number) => (value > 0 ? String(value) : ''),
      },
    };
  }

  /** Teto do eixo Y com folga para o rótulo acima da barra mais alta. */
  private tipo4BarYAxisMax(peak: number): number {
    if (peak <= 0) return 5;
    const withHeadroom = peak + Math.max(5, Math.ceil(peak * 0.18));
    return Math.max(5, Math.ceil(withHeadroom / 5) * 5);
  }

  private buildTipo4GroupedBarChart(params: {
    title: string;
    labels: string[];
    datasets: Array<{ label: string; data: number[]; backgroundColor: string }>;
    yMax?: number;
  }) {
    const peak = Math.max(
      0,
      ...params.datasets.flatMap((d) => d.data.map((n) => Number(n) || 0)),
    );
    const autoMax = this.tipo4BarYAxisMax(peak);
    const yMax = params.yMax != null ? Math.max(params.yMax, autoMax) : autoMax;

    return {
      type: 'bar',
      data: {
        labels: params.labels,
        datasets: params.datasets.map((d) => ({
          ...d,
          borderWidth: 0,
          maxBarThickness: 48,
        })),
      },
      options: {
        layout: { padding: { top: 28, bottom: 8, left: 4, right: 4 } },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            align: 'center',
            labels: { boxWidth: 14, padding: 14 },
          },
          title: {
            display: true,
            text: params.title,
            position: 'bottom',
            font: { size: 12 },
            padding: { top: 12 },
          },
          ...this.tipo4DatalabelsPlugin(),
        },
        scales: {
          x: {
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            max: yMax,
            grid: { color: 'rgba(0,0,0,0.08)' },
          },
        },
      },
    };
  }

  private buildTipo4LineChart(params: {
    title: string;
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      borderColor: string;
    }>;
    rotateLabels?: boolean;
  }) {
    const peak = Math.max(
      0,
      ...params.datasets.flatMap((d) => d.data.map((n) => Number(n) || 0)),
    );
    const yMax = this.tipo4BarYAxisMax(peak);

    return {
      type: 'line',
      data: {
        labels: params.labels,
        datasets: params.datasets.map((d) => ({
          label: d.label,
          data: d.data,
          borderColor: d.borderColor,
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: d.borderColor,
          tension: 0.15,
          fill: false,
        })),
      },
      options: {
        layout: { padding: { top: 28, bottom: 8 } },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            align: 'center',
            labels: { boxWidth: 14, padding: 12 },
          },
          title: {
            display: true,
            text: params.title,
            position: 'bottom',
            font: { size: 12 },
            padding: { top: 10 },
          },
          ...this.tipo4DatalabelsPlugin(),
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: params.rotateLabels
              ? { maxRotation: 40, minRotation: 25, autoSkip: false }
              : undefined,
          },
          y: {
            beginAtZero: true,
            max: yMax,
            grid: { color: 'rgba(0,0,0,0.08)' },
          },
        },
      },
    };
  }

  private async embedTipo4Chart(
    workbook: ExcelJS.Workbook,
    sheet: ExcelJS.Worksheet,
    rowAfterTable: number,
    chartConfig: unknown,
  ) {
    const chart = await this.fetchChartPng({
      width: 880,
      height: 300,
      backgroundColor: 'white',
      chart: chartConfig,
      plugins: this.tipo4ChartPlugins(),
    });
    if (!chart) return;
    const imageId = workbook.addImage({ buffer: chart as any, extension: 'png' });
    const chartRow = rowAfterTable + 0.2;
    sheet.addImage(imageId, {
      tl: { col: 0.1, row: chartRow },
      ext: { width: 720, height: 240 },
    });
    const rowsNeeded = Math.ceil(240 / 18);
    for (let r = 0; r < rowsNeeded; r += 1) {
      sheet.getRow(Math.floor(chartRow) + r + 1).height = 18;
    }
  }

  private async loadTipo4ReportBundle(params: {
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
        tifluxClientId: true,
        zabbixGroupName: true,
        logoFile: { select: { path: true, mimeType: true } },
      },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    const group = company.zabbixGroupName?.trim() || 'ALLE-CLOUD';
    const startIso = params.start.toISOString();
    const endIso = params.end.toISOString();

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
    const alertasSemanaRaw = Array.isArray(
      (dash as { alertasPorSemana?: unknown[] }).alertasPorSemana,
    )
      ? ((dash as {
          alertasPorSemana: Array<{
            weekLabel: string;
            High: number;
            Disaster: number;
          }>;
        }).alertasPorSemana ?? [])
      : [];

    const chamadosMonths = this.splitTipo4MonthRows(chamados as any).months;
    const horasMonths = this.splitTipo4MonthRows(horas as any).months;
    const alertasMonths = this.splitTipo4MonthRows(alertas as any).months;
    const alertasWeeks =
      alertasSemanaRaw.length > 0
        ? alertasSemanaRaw
        : (alertasMonths as Array<{
            monthLabel: string;
            High: number;
            Disaster: number;
          }>).map((row) => ({
            weekLabel: row.monthLabel,
            High: Number(row.High) || 0,
            Disaster: Number(row.Disaster) || 0,
          }));

    const monitoringUseWeekly = isMonitoringPeriodWeekly(
      params.start,
      params.end,
    );
    const alertasMonitoringRows = monitoringUseWeekly
      ? alertasWeeks.map((row) => ({
          periodLabel: row.weekLabel,
          High: Number(row.High) || 0,
          Disaster: Number(row.Disaster) || 0,
        }))
      : (alertasMonths as Array<{
          monthLabel: string;
          High: number;
          Disaster: number;
        }>).map((row) => ({
          periodLabel: row.monthLabel,
          High: Number(row.High) || 0,
          Disaster: Number(row.Disaster) || 0,
        }));
    const dashSummary = (dash as { summary?: Record<string, unknown> })
      .summary;
    const topTriggers = Array.isArray(
      (dash as { topTriggers?: unknown[] }).topTriggers,
    )
      ? ((dash as { topTriggers: Array<{
          host: string;
          trigger: string;
          severity: string;
          count: number;
        }> }).topTriggers)
      : [];
    const allTriggersInPeriod = Array.isArray(
      (dash as { allTriggersInPeriod?: unknown[] }).allTriggersInPeriod,
    )
      ? ((dash as { allTriggersInPeriod: Array<{
          host: string;
          trigger: string;
          severity: string;
          count: number;
        }> }).allTriggersInPeriod)
      : topTriggers;
    const principaisHosts = Array.isArray(
      (dash as { principaisHostsPorMes?: unknown[] }).principaisHostsPorMes,
    )
      ? ((dash as {
          principaisHostsPorMes: Array<{
            monthLabel: string;
            High: Array<{ host: string; quantity: number }>;
            Disaster: Array<{ host: string; quantity: number }>;
          }>;
        }).principaisHostsPorMes)
      : [];
    const ticketsStats =
      company.tifluxClientId != null
        ? await this.getTipo4TicketsStats({
            tifluxClientId: company.tifluxClientId,
            start: params.start,
            end: params.end,
          })
        : {
            openedInPeriod: 0,
            closedInPeriod: 0,
            openNowTotal: 0,
            ticketsBaseTotal: 0,
            openTickets: [],
          };

    return {
      company,
      group,
      periodLabel: this.formatTipo4PeriodLabel(params.start, params.end),
      periodStartIso: startIso,
      periodEndIso: endIso,
      monitoringUseWeekly,
      chamadosMonths,
      horasMonths,
      alertasMonitoringRows,
      dashSummary,
      topTriggers,
      allTriggersInPeriod,
      principaisHosts,
      ticketsStats,
    };
  }

  private async generateTipo4Csv(params: {
    user: AuthenticatedRequestUser;
    companyId: string;
    start: Date;
    end: Date;
  }) {
    const loaded = await this.loadTipo4ReportBundle(params);
    return buildTipo4ReportCsv({
      companyName: loaded.company.name,
      zabbixGroup: loaded.group,
      periodLabel: loaded.periodLabel,
      periodStartIso: loaded.periodStartIso,
      periodEndIso: loaded.periodEndIso,
      monitoringUseWeekly: loaded.monitoringUseWeekly,
      chamadosMonths: loaded.chamadosMonths,
      horasMonths: loaded.horasMonths,
      alertasMonitoringRows: loaded.alertasMonitoringRows,
      dashSummary: loaded.dashSummary,
      topTriggers: loaded.topTriggers,
      allTriggersInPeriod: loaded.allTriggersInPeriod,
      principaisHosts: loaded.principaisHosts,
      ticketsStats: loaded.ticketsStats,
    });
  }

  private async generateTipo4Xlsx(params: {
    user: AuthenticatedRequestUser;
    companyId: string;
    start: Date;
    end: Date;
  }) {
    const loaded = await this.loadTipo4ReportBundle(params);
    const company = loaded.company;
    const group = loaded.group;
    const chamadosMonths = loaded.chamadosMonths;
    const horasMonths = loaded.horasMonths;
    const alertasMonitoringRows = loaded.alertasMonitoringRows;
    const monitoringUseWeekly = loaded.monitoringUseWeekly;
    const dashSummary = loaded.dashSummary;
    const topTriggers = loaded.topTriggers;
    const allTriggersInPeriod = loaded.allTriggersInPeriod;
    const principaisHosts = loaded.principaisHosts;
    const ticketsStats = loaded.ticketsStats;

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

    // Aba 1: Chamados por mês (modelo Alle)
    {
      const sheet = workbook.addWorksheet('Chamados por mês', {
        views: [{ state: 'frozen', ySplit: 5 }],
      });
      const colCount = 7;
      sheet.columns = [
        { width: 16 },
        { width: 14 },
        { width: 10 },
        { width: 10 },
        { width: 10 },
        { width: 12 },
        { width: 10 },
      ];
      this.styleTipo4TitleBand(sheet, 'Chamados Por Mês', colCount);
      addCompanyLogo(sheet);
      this.styleTipo4TableTitleRow(sheet, 'Total de Tickets', colCount);

      const headerRow = sheet.getRow(4);
      headerRow.values = [
        'Mês',
        'Infraestrutura',
        'NOC',
        'Rotinas',
        'Consult',
        'Sistemas',
        'Total',
      ];
      this.styleTipo4ColumnHeaderRow(headerRow, colCount);

      let rowIdx = 5;
      for (const r of chamadosMonths as any[]) {
        const row = sheet.getRow(rowIdx);
        const infra = Number(r.Infraestrutura) || 0;
        row.values = [
          r.monthLabel,
          infra > 0 ? infra : null,
          Number(r.NOC) || 0,
          Number(r.Rotinas) || 0,
          Number(r.Consult) || 0,
          Number(r.Sistema) || 0,
          Number(r.Total) || 0,
        ];
        this.styleTipo4DataRow(row, rowIdx - 5, colCount);
        rowIdx += 1;
      }

      await this.embedTipo4Chart(
        workbook,
        sheet,
        rowIdx + 1,
        this.buildTipo4GroupedBarChart({
          title: 'Tickets por Mês',
          labels: (chamadosMonths as any[]).map((r) => r.monthLabel),
          datasets: [
            {
              label: 'Infraestrutura',
              data: (chamadosMonths as any[]).map((r) => r.Infraestrutura),
              backgroundColor: this.tipo4Theme.infra,
            },
            {
              label: 'NOC',
              data: (chamadosMonths as any[]).map((r) => r.NOC),
              backgroundColor: this.tipo4Theme.noc,
            },
            {
              label: 'Rotinas',
              data: (chamadosMonths as any[]).map((r) => r.Rotinas),
              backgroundColor: this.tipo4Theme.rotinas,
            },
            {
              label: 'Consult',
              data: (chamadosMonths as any[]).map((r) => r.Consult),
              backgroundColor: this.tipo4Theme.consult,
            },
            {
              label: 'Sistemas',
              data: (chamadosMonths as any[]).map((r) => r.Sistema),
              backgroundColor: this.tipo4Theme.sistemas,
            },
          ],
        }),
      );
    }

    // Aba 2: Apontamento de Horas (modelo Alle)
    {
      const sheet = workbook.addWorksheet('Apontamento de Horas', {
        views: [{ state: 'frozen', ySplit: 5 }],
      });
      const colCount = 7;
      sheet.columns = [
        { width: 16 },
        { width: 14 },
        { width: 10 },
        { width: 10 },
        { width: 10 },
        { width: 12 },
        { width: 10 },
      ];
      this.styleTipo4TitleBand(sheet, 'Apontamento de Horas', colCount);
      addCompanyLogo(sheet);
      this.styleTipo4TableTitleRow(sheet, 'Total de Horas Apontadas', colCount);

      const headerRow = sheet.getRow(4);
      headerRow.values = [
        'Mês',
        'Infraestrutura',
        'NOC',
        'Rotinas',
        'Consult',
        'Sistemas',
        'Total',
      ];
      this.styleTipo4ColumnHeaderRow(headerRow, colCount);

      const hourFmt = '#,##0.00';
      let rowIdx = 5;
      for (const r of horasMonths as any[]) {
        const row = sheet.getRow(rowIdx);
        const infra = Number(r.Infraestrutura) || 0;
        row.values = [
          r.monthLabel,
          infra > 0 ? infra : null,
          Number(r.NOC) || 0,
          Number(r.Rotinas) || 0,
          Number(r.Consult) || 0,
          Number(r.Sistema) || 0,
          Number(r.Total) || 0,
        ];
        this.styleTipo4DataRow(row, rowIdx - 5, colCount);
        for (let c = 2; c <= colCount; c += 1) {
          row.getCell(c).numFmt = hourFmt;
        }
        rowIdx += 1;
      }

      await this.embedTipo4Chart(
        workbook,
        sheet,
        rowIdx + 1,
        this.buildTipo4GroupedBarChart({
          title: 'Total de Horas Apontadas',
          labels: (horasMonths as any[]).map((r) => r.monthLabel),
          datasets: [
            {
              label: 'Infraestrutura',
              data: (horasMonths as any[]).map((r) => r.Infraestrutura),
              backgroundColor: this.tipo4Theme.infra,
            },
            {
              label: 'NOC',
              data: (horasMonths as any[]).map((r) => r.NOC),
              backgroundColor: this.tipo4Theme.noc,
            },
            {
              label: 'Rotinas',
              data: (horasMonths as any[]).map((r) => r.Rotinas),
              backgroundColor: this.tipo4Theme.rotinas,
            },
            {
              label: 'Consult',
              data: (horasMonths as any[]).map((r) => r.Consult),
              backgroundColor: this.tipo4Theme.consult,
            },
            {
              label: 'Sistemas',
              data: (horasMonths as any[]).map((r) => r.Sistema),
              backgroundColor: this.tipo4Theme.sistemas,
            },
            {
              label: 'Total',
              data: (horasMonths as any[]).map((r) => r.Total),
              backgroundColor: this.tipo4Theme.totalCyan,
            },
          ],
          yMax: 50,
        }),
      );
    }

    // Aba 3: Monitoramento (modelo Alle)
    {
      const sheet = workbook.addWorksheet('Monitoramento', {
        views: [{ state: 'frozen', ySplit: 5 }],
      });
      const colCount = 3;
      sheet.columns = [{ width: 18 }, { width: 12 }, { width: 12 }];
      this.styleTipo4TitleBand(sheet, 'Monitoramento', colCount);
      addCompanyLogo(sheet);
      this.styleTipo4TableTitleRow(
        sheet,
        monitoringUseWeekly
          ? 'Total de Alertas por Semana'
          : 'Total de Alertas por Mês',
        colCount,
      );

      const headerRow = sheet.getRow(4);
      headerRow.values = [
        monitoringUseWeekly ? 'Semana' : 'Mês',
        'High',
        'Disaster',
      ];
      this.styleTipo4ColumnHeaderRow(headerRow, colCount);

      let rowIdx = 5;
      for (const r of alertasMonitoringRows) {
        const row = sheet.getRow(rowIdx);
        row.values = [r.periodLabel, r.High, r.Disaster];
        this.styleTipo4DataRow(row, rowIdx - 5, colCount);
        rowIdx += 1;
      }

      const chartLabels = alertasMonitoringRows.map((r) => r.periodLabel);
      await this.embedTipo4Chart(
        workbook,
        sheet,
        rowIdx + 1,
        this.buildTipo4LineChart({
          title: monitoringUseWeekly
            ? 'Alertas por Semana'
            : 'Alertas por Mês',
          labels: chartLabels,
          rotateLabels: chartLabels.length > 4,
          datasets: [
            {
              label: 'High',
              data: alertasMonitoringRows.map((r) => r.High),
              borderColor: this.tipo4Theme.high,
            },
            {
              label: 'Disaster',
              data: alertasMonitoringRows.map((r) => r.Disaster),
              borderColor: this.tipo4Theme.disaster,
            },
          ],
        }),
      );
    }

    // Aba 4: Top Triggers e totais do período (grp Zabbix da empresa)
    {
      const sheet = workbook.addWorksheet('Top Triggers');
      this.writeTipo4TopTriggersSheet({
        sheet,
        companyName: company.name,
        group,
        periodLabel: loaded.periodLabel,
        dashSummary,
        topTriggers,
        principaisHosts,
        addCompanyLogo,
      });
    }

    // Aba 5: todas as triggers do período (linha a linha)
    {
      const sheet = workbook.addWorksheet('Triggers período');
      this.writeTipo4AllTriggersSheet({
        sheet,
        companyName: company.name,
        group,
        periodLabel: loaded.periodLabel,
        rows: allTriggersInPeriod,
        addCompanyLogo,
      });
    }

    // Aba 6: chamados abertos/fechados e chamados em aberto geral
    {
      const sheet = workbook.addWorksheet('Chamados geral');
      await this.writeTipo4TicketsSheet({
        workbook,
        sheet,
        companyName: company.name,
        periodLabel: loaded.periodLabel,
        stats: ticketsStats,
        addCompanyLogo,
      });
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

  private formatMinutesHHMM(totalMinutes: number): string {
    const total = Math.max(0, Math.trunc(Number(totalMinutes) || 0));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private formatTimeHHMM(value?: string | null): string {
    const raw = String(value || '').trim();
    if (!raw) return '--:--';
    const [h = '00', m = '00'] = raw.split(':');
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
  }

  private formatReportDescription(value?: string | null): string {
    const text = String(value || '').trim();
    if (text.length >= 40) return text;
    if (!text) return '-'.repeat(40);
    return text.padEnd(40, '·');
  }

  private formatMonthShort(dateOnly: string): string {
    const d = new Date(`${dateOnly}T12:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    const months = [
      'jan',
      'fev',
      'mar',
      'abr',
      'mai',
      'jun',
      'jul',
      'ago',
      'set',
      'out',
      'nov',
      'dez',
    ];
    return `${months[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`;
  }

  private mapAssistenciaLabel(createdByWayOf?: string | null): string {
    const raw = String(createdByWayOf || '').trim();
    if (!raw) return '-';
    const normalized = raw.toLowerCase();
    if (normalized.includes('intern')) return 'Interno';
    if (normalized.includes('remot')) return 'Remoto';
    if (normalized.includes('presen') || normalized.includes('onsite'))
      return 'Presencial';
    return raw;
  }

  private async resolveRendimentoCompanyScope(
    user: AuthenticatedRequestUser,
    companyId: string,
  ): Promise<{
    allCompanies: boolean;
    displayName: string;
    representativeCompanyId: string;
    companies: Array<{ id: string; name: string; tifluxClientId: number }>;
  }> {
    const scopeCompanyIds = await this.getAccessibleCompanyIds(user);

    if (companyId === ALL_COMPANIES_REPORT_ID) {
      if (user.role === 'CLIENT') {
        throw new ForbiddenException(
          'Usuários CLIENT não podem gerar apontamentos de todas as empresas.',
        );
      }

      const companies = await this.prisma.company.findMany({
        where: {
          id: { in: scopeCompanyIds },
          deletedAt: null,
          tifluxClientId: { not: null },
        },
        select: { id: true, name: true, tifluxClientId: true },
        orderBy: { name: 'asc' },
      });

      const withClient = companies.filter(
        (c): c is { id: string; name: string; tifluxClientId: number } =>
          c.tifluxClientId != null,
      );

      if (!withClient.length) {
        throw new BadRequestException(
          'Nenhuma empresa com cliente TiFlux configurado para gerar apontamentos.',
        );
      }

      return {
        allCompanies: true,
        displayName: 'Todas as empresas',
        representativeCompanyId: withClient[0].id,
        companies: withClient,
      };
    }

    this.ensureCompanyInScope(companyId, scopeCompanyIds);
    const company = await this.requireCompanyTifluxClientId(companyId);

    return {
      allCompanies: false,
      displayName: company.name,
      representativeCompanyId: company.id,
      companies: [company],
    };
  }

  private async getRendimentoDetailedRows(params: {
    companies: Array<{ id: string; name: string; tifluxClientId: number }>;
    start: Date;
    end: Date;
    userId?: string | null;
  }): Promise<
    Array<{
      attendant: string;
      ticketNumber: number;
      title: string;
      apontamento: string;
      durationHHMM: string;
      overtimeHHMM: string;
      plantaoHHMM: string;
      description: string;
      client: string;
      equipe: string;
      monthLabel: string;
    }>
  > {
    const collaboratorFilter = await this.resolveCollaboratorAppointmentFilter(
      params.userId,
    );
    const startDateOnly = toDateOnlyISO(params.start);
    const endDateOnly = toDateOnlyISO(params.end);
    const tifluxClientIds = params.companies.map((c) => c.tifluxClientId);

    const rows =
      (await this.prisma.$queryRaw<
        Array<{
          user_name: string | null;
          ticket_number: number | null;
          title: string | null;
          description: string | null;
          appointment_date: string;
          init_time: string | null;
          end_time: string | null;
          client_name: string | null;
          valorization_raw: unknown | null;
          created_by_way_of: string | null;
        }>
      >`
        select
          a.user_name,
          a.ticket_number,
          coalesce(t.title, a.description, '') as title,
          coalesce(a.description, '') as description,
          a.appointment_date::date::text as appointment_date,
          a.init_time::text as init_time,
          a.end_time::text as end_time,
          a.client_name,
          a.valorization_raw,
          t.created_by_way_of
        from tiflux.ticket_appointments a
        inner join tiflux.tickets t
          on t.ticket_number = a.ticket_number
        where t.client_external_id = any(${tifluxClientIds}::int[])
          and a.appointment_date::date between ${startDateOnly}::date and ${endDateOnly}::date
          and a.user_name is not null
          and trim(a.user_name) <> ''
          and (
            (${collaboratorFilter.tifluxUserExternalId}::int is null and ${collaboratorFilter.attendantName}::text is null)
            or (
              ${collaboratorFilter.tifluxUserExternalId}::int is not null
              and a.user_external_id = ${collaboratorFilter.tifluxUserExternalId}::int
            )
            or (
              ${collaboratorFilter.tifluxUserExternalId}::int is null
              and ${collaboratorFilter.attendantName}::text is not null
              and lower(trim(a.user_name)) = lower(trim(${collaboratorFilter.attendantName}))
            )
          )
        order by a.appointment_date::date asc, a.user_name asc, a.ticket_number asc, a.external_id asc
      `) ?? [];

    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        name: true,
        serviceDeskLinks: {
          include: { serviceDesk: { select: { name: true } } },
        },
      },
    });
    const teamByUserName = new Map<string, string>();
    for (const u of users) {
      const key = normalizeNameKey(u.name);
      if (!key) continue;
      const desks = u.serviceDeskLinks
        .map((l) => l.serviceDesk.name)
        .filter((name) => !!String(name || '').trim());
      if (desks.length === 0) continue;
      teamByUserName.set(key, desks.join(' / '));
    }

    return rows.map((r) => {
      const attendant = String(r.user_name || '').trim();
      const dateLabel = new Date(`${r.appointment_date}T12:00:00`).toLocaleDateString(
        'pt-BR',
      );
      const initHHMM = this.formatTimeHHMM(r.init_time);
      const endHHMM = this.formatTimeHHMM(r.end_time);
      const durationMinutes = this.getAppointmentMinutes({
        init_time: r.init_time || undefined,
        end_time: r.end_time || undefined,
      });
      const equipe =
        teamByUserName.get(normalizeNameKey(attendant)) || 'Sem equipe';
      const overtimeKind = overtimeKindFromValorization(r.valorization_raw);
      const durationHHMM = this.formatMinutesHHMM(durationMinutes);

      return {
        attendant,
        ticketNumber: Number(r.ticket_number) || 0,
        title: String(r.title || '').trim(),
        apontamento: `${dateLabel} (${initHHMM} - ${endHHMM})`,
        durationHHMM,
        overtimeHHMM: overtimeKind === 'EXTRA' ? durationHHMM : '',
        plantaoHHMM: overtimeKind === 'PLANTAO' ? durationHHMM : '',
        description: this.formatReportDescription(r.description),
        client: String(r.client_name || '').trim() || '-',
        equipe,
        monthLabel: this.formatMonthShort(r.appointment_date),
      };
    });
  }

  private async getHoursUsageRows(params: {
    companies: Array<{ id: string; name: string; tifluxClientId: number }>;
    start: Date;
    end: Date;
    userId?: string | null;
  }): Promise<Array<{ day: string; user: string; minutes: number; company: string }>> {
    const collaboratorFilter = await this.resolveCollaboratorAppointmentFilter(
      params.userId,
    );

    const startDateOnly = toDateOnlyISO(params.start);
    const endDateOnly = toDateOnlyISO(params.end);
    const tifluxClientIds = params.companies.map((c) => c.tifluxClientId);
    const companyNameByTifluxId = new Map(
      params.companies.map((c) => [c.tifluxClientId, c.name]),
    );

    // 1) Tentativa 100% banco (rápida)
    const dbRows =
      (await this.prisma.$queryRaw<
        Array<{
          day: string;
          user_name: string | null;
          minutes: number;
          client_external_id: number;
        }>
      >`
        select
          a.appointment_date::date::text as day,
          a.user_name,
          t.client_external_id,
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
        where t.client_external_id = any(${tifluxClientIds}::int[])
          and a.appointment_date::date between ${startDateOnly}::date and ${endDateOnly}::date
          and (
            (${collaboratorFilter.tifluxUserExternalId}::int is null and ${collaboratorFilter.attendantName}::text is null)
            or (
              ${collaboratorFilter.tifluxUserExternalId}::int is not null
              and a.user_external_id = ${collaboratorFilter.tifluxUserExternalId}::int
            )
            or (
              ${collaboratorFilter.tifluxUserExternalId}::int is null
              and ${collaboratorFilter.attendantName}::text is not null
              and lower(trim(a.user_name)) = lower(trim(${collaboratorFilter.attendantName}))
            )
          )
        group by a.appointment_date::date, a.user_name, t.client_external_id
        order by a.appointment_date::date asc, a.user_name asc
      `) ?? [];

    if (dbRows.length) {
      return dbRows.map((r) => ({
        day: r.day,
        user: r.user_name ?? 'SEM_USUARIO',
        minutes: Number(r.minutes) || 0,
        company:
          companyNameByTifluxId.get(Number(r.client_external_id)) ?? 'Empresa',
      }));
    }

    // 2) Fallback: chama API TiFlux e agrega em memória (e as chamadas ficam cacheadas em `external_api_cache`).
    // Observação: TiFlux não tem um endpoint único por "apontamentos no período" por cliente,
    // então buscamos tickets atualizados no intervalo e carregamos appointments por ticket.
    const byKey = new Map<
      string,
      { day: string; user: string; minutes: number; company: string }
    >();

    for (const company of params.companies) {
      const tickets = await this.tiflux.getTickets({
        filter_by: 'all',
        client_ids: [company.tifluxClientId],
        update_start_datetime: params.start.toISOString(),
        update_end_datetime: params.end.toISOString(),
        limit: 200,
        offset: 1,
      });

      const appointmentLists = await mapWithConcurrency(
        tickets,
        6,
        (t) =>
          this.tiflux.getTicketAppointmentsAll(t.ticket_number, {
            start_date: startDateOnly,
            end_date: endDateOnly,
            limit: 200,
          }),
      );

      for (const appts of appointmentLists) {
        for (const a of appts) {
          const day = String(a.date ?? '').slice(0, 10);
          if (!day) continue;
          const user = a.user?.name?.trim() || 'SEM_USUARIO';
          const minutes = this.getAppointmentMinutes({
            init_time: a.init_time,
            end_time: a.end_time,
          });
          if (!minutes) continue;

          const key = `${company.id}::${day}::${user}`;
          const prev = byKey.get(key);
          if (prev) {
            prev.minutes += minutes;
          } else {
            byKey.set(key, { day, user, minutes, company: company.name });
          }
        }
      }
    }

    return Array.from(byKey.values()).sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        a.company.localeCompare(b.company, 'pt-BR') ||
        a.user.localeCompare(b.user, 'pt-BR'),
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

  /** Colaboradores ativos do portal (ADMIN, COLLABORATOR e Terceiro/PJ). */
  async listRendimentoCollaborators(_user: AuthenticatedRequestUser) {
    const collaborators = await this.rendimento.listCollaboratorsForSelect({
      includePj: true,
    });
    return collaborators.map((c) => ({
      id: c.id,
      name: c.name,
      hasTifluxLink: c.tifluxUserId != null,
    }));
  }

  private async requireCompanyTifluxClientId(companyId: string): Promise<{
    id: string;
    name: string;
    tifluxClientId: number;
  }> {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { id: true, name: true, tifluxClientId: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');
    if (!company.tifluxClientId) {
      throw new BadRequestException(
        'Empresa sem cliente TiFlux configurado. Não é possível gerar apontamentos por empresa.',
      );
    }
    return {
      id: company.id,
      name: company.name,
      tifluxClientId: company.tifluxClientId,
    };
  }

  private async resolveCollaboratorAppointmentFilter(userId?: string | null): Promise<{
    tifluxUserExternalId: number | null;
    attendantName: string | null;
  }> {
    const id = userId?.trim();
    if (!id) {
      return { tifluxUserExternalId: null, attendantName: null };
    }

    const collaborators = await this.rendimento.listCollaboratorsForSelect({
      includePj: true,
    });
    const match = collaborators.find((c) => c.id === id);
    if (!match) {
      throw new BadRequestException('Colaborador não encontrado.');
    }

    const tifluxUserExternalId = match.tifluxUserId ?? null;
    const attendantName =
      match.tifluxUserName?.trim() || match.name?.trim() || null;

    if (!tifluxUserExternalId && !attendantName) {
      throw new BadRequestException(
        `Colaborador "${match.name}" sem vínculo com TiFlux para filtrar apontamentos.`,
      );
    }

    return { tifluxUserExternalId, attendantName };
  }

  private countRendimentoAlertsInPeriod(
    group: Array<{
      appointment_id: number;
      appointment_date: string;
      init_time: string | null;
      end_time: string | null;
      minutes: number;
      valorization_raw: unknown | null;
    }>,
  ): number {
    const byDay = new Map<string, typeof group>();
    for (const row of group) {
      const key = row.appointment_date;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(row);
    }

    let alerts = 0;
    for (const dayRows of byDay.values()) {
      const entries = dayRows.map((row) => ({
        id: Number(row.appointment_id) || 0,
        date: row.appointment_date,
        initTime: row.init_time,
        endTime: row.end_time,
        minutes: Number(row.minutes) || 0,
        hoursFormatted: this.formatMinutesHHMM(Number(row.minutes) || 0),
        ticketNumber: 0,
        clientName: null,
        description: null,
      }));
      const valorizationById = new Map(
        dayRows.map((row) => [Number(row.appointment_id) || 0, row.valorization_raw]),
      );
      const { insights } = analyzeRendimentoDay(entries, valorizationById);
      alerts += insights.gaps.filter((g) => g.type === 'idle').length;
    }
    return alerts;
  }

  /**
   * Relatório exemplo: CSV de consumo de horas por empresa no período,
   * com base no cache TiFlux (schema `tiflux.*` no Postgres).
   */
  async generateHoursUsageCsv(params: {
    user: AuthenticatedRequestUser;
    companyId: string;
    start: Date;
    end: Date;
    userId?: string | null;
  }) {
    if (!params.companyId?.trim()) {
      throw new BadRequestException('companyId é obrigatório');
    }

    const scope = await this.resolveRendimentoCompanyScope(
      params.user,
      params.companyId.trim(),
    );

    const startDateOnly = toDateOnlyISO(params.start);
    const endDateOnly = toDateOnlyISO(params.end);

    const rows = await this.getHoursUsageRows({
      companies: scope.companies,
      start: params.start,
      end: params.end,
      userId: params.userId,
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
        escapeCsv(r.company),
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
    user: AuthenticatedRequestUser;
    companyId: string;
    start: Date;
    end: Date;
    type: string;
    userId?: string | null;
  }) {
    const scope = await this.resolveRendimentoCompanyScope(
      params.user,
      params.companyId.trim(),
    );

    const company = await this.prisma.company.findFirst({
      where: { id: scope.representativeCompanyId, deletedAt: null },
      select: {
        id: true,
        name: true,
        logoFile: { select: { path: true, mimeType: true } },
      },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    const collaboratorLabel = params.userId?.trim()
      ? (
          await this.prisma.user.findFirst({
            where: { id: params.userId.trim(), deletedAt: null },
            select: { name: true },
          })
        )?.name ?? 'Colaborador'
      : 'Todos os colaboradores';

    const startDateOnly = toDateOnlyISO(params.start);
    const endDateOnly = toDateOnlyISO(params.end);

    const rows = await this.getRendimentoDetailedRows({
      companies: scope.companies,
      start: params.start,
      end: params.end,
      userId: params.userId,
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Alle One';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Relatório', {
      views: [{ state: 'frozen', ySplit: 8 }],
    });

    // Cabeçalho + logo
    sheet.getColumn(1).width = 28;
    sheet.getColumn(2).width = 12;
    sheet.getColumn(3).width = 40;
    sheet.getColumn(4).width = 28;
    sheet.getColumn(5).width = 12;
    sheet.getColumn(6).width = 12;
    sheet.getColumn(7).width = 12;
    sheet.getColumn(8).width = 48;
    sheet.getColumn(9).width = 26;
    sheet.getColumn(10).width = 22;
    sheet.getColumn(11).width = 10;

    sheet.mergeCells('A1:K1');
    sheet.getCell('A1').value = 'Relatório Rendimento';
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
    sheet.getCell('B2').value = scope.displayName;
    sheet.getCell('A3').value = 'Colaborador:';
    sheet.getCell('B3').value = collaboratorLabel;
    sheet.getCell('A4').value = 'Período:';
    sheet.getCell('B4').value = `${startDateOnly} até ${endDateOnly}`;
    sheet.getCell('A5').value = 'Gerado em:';
    sheet.getCell('B5').value = new Date()
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');

    ['A2', 'A3', 'A4', 'A5'].forEach((addr) => {
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
          tl: { col: 7.2, row: 0.2 },
          ext: { width: 120, height: 40 },
        });
      }
    }

    // Tabela
    const headerRowIndex = 8;
    const header = [
      'Atendente',
      'ID Ticket',
      'Título',
      'Apontamento',
      'Duração',
      'Hora extra',
      'Plantão',
      'Descrição',
      'Cliente',
      'Equipe',
      'Mês',
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
      sheet.getRow(rowIndex).values = [
        r.attendant,
        r.ticketNumber || null,
        r.title,
        r.apontamento,
        r.durationHHMM,
        r.overtimeHHMM,
        r.plantaoHHMM,
        r.description,
        r.client,
        r.equipe,
        r.monthLabel,
      ];
      sheet.getRow(rowIndex).getCell(2).numFmt = '0';
      rowIndex += 1;
    }

    sheet.autoFilter = {
      from: { row: headerRowIndex, column: 1 },
      to: { row: headerRowIndex, column: 11 },
    };

    const companyTiflux = await this.requireCompanyTifluxClientId(params.companyId);
    const collaboratorFilter = await this.resolveCollaboratorAppointmentFilter(
      params.userId,
    );

    const rawRows =
      (await this.prisma.$queryRaw<
        Array<{
          appointment_id: number;
          user_name: string | null;
          appointment_date: string;
          init_time: string | null;
          end_time: string | null;
          minutes: number;
          valorization_raw: unknown | null;
        }>
      >`
        select
          a.external_id as appointment_id,
          a.user_name,
          a.appointment_date::date::text as appointment_date,
          a.init_time::text as init_time,
          a.end_time::text as end_time,
          a.valorization_raw,
          coalesce(
            case
              when a.init_time is null or a.end_time is null then 0
              when a.end_time::time >= a.init_time::time
                then extract(epoch from (a.end_time::time - a.init_time::time)) / 60
              else extract(epoch from ((a.end_time::time + interval '24 hours') - a.init_time::time)) / 60
            end,
            0
          )::int as minutes
        from tiflux.ticket_appointments a
        inner join tiflux.tickets t
          on t.ticket_number = a.ticket_number
        where t.client_external_id = ${companyTiflux.tifluxClientId}
          and a.appointment_date::date between ${startDateOnly}::date and ${endDateOnly}::date
          and a.user_name is not null
          and trim(a.user_name) <> ''
          and (
            (${collaboratorFilter.tifluxUserExternalId}::int is null and ${collaboratorFilter.attendantName}::text is null)
            or (
              ${collaboratorFilter.tifluxUserExternalId}::int is not null
              and a.user_external_id = ${collaboratorFilter.tifluxUserExternalId}::int
            )
            or (
              ${collaboratorFilter.tifluxUserExternalId}::int is null
              and ${collaboratorFilter.attendantName}::text is not null
              and lower(trim(a.user_name)) = lower(trim(${collaboratorFilter.attendantName}))
            )
          )
      `) ?? [];

    const byAttendant = new Map<
      string,
      Array<{
        appointment_id: number;
        user_name: string | null;
        appointment_date: string;
        init_time: string | null;
        end_time: string | null;
        minutes: number;
        valorization_raw: unknown | null;
      }>
    >();
    for (const row of rawRows) {
      const name = String(row.user_name || '').trim();
      if (!name) continue;
      if (!byAttendant.has(name)) byAttendant.set(name, []);
      byAttendant.get(name)!.push(row);
    }

    rowIndex += 2;
    sheet.getRow(rowIndex).values = [
      'Resumo (sem sobreposição)',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ];
    sheet.getRow(rowIndex).font = { bold: true };
    rowIndex += 1;

    const summaryHeader = sheet.getRow(rowIndex);
    summaryHeader.values = [
      'Atendente',
      null,
      null,
      null,
      'Total',
      'Hora extra',
      'Plantão',
      'Alertas',
      null,
      null,
      null,
    ];
    summaryHeader.font = { bold: true };
    rowIndex += 1;

    const attendantNames = [...byAttendant.keys()].sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    );
    for (const name of attendantNames) {
      const group = byAttendant.get(name)!;
      const mapped = group.map((r) => ({
        appointment_date: r.appointment_date,
        init_time: r.init_time,
        end_time: r.end_time,
        minutes: Number(r.minutes) || 0,
        valorization_raw: r.valorization_raw,
      }));
      const total = computeUnionWorkedMinutes(mapped, 'ALL');
      const extra = computeUnionWorkedMinutes(mapped, 'EXTRA');
      const plantao = computeUnionWorkedMinutes(mapped, 'PLANTAO');
      const alerts = this.countRendimentoAlertsInPeriod(group);
      const row = sheet.getRow(rowIndex);
      row.values = [
        name,
        null,
        null,
        null,
        this.formatMinutesHHMM(total),
        this.formatMinutesHHMM(extra),
        this.formatMinutesHHMM(plantao),
        alerts,
        null,
        null,
        null,
      ];
      rowIndex += 1;
    }

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
    if (companyId && companyId !== ALL_COMPANIES_REPORT_ID) {
      this.ensureCompanyInScope(companyId, scopeCompanyIds);
    }

    const start = query.start
      ? parseDateOrThrow(query.start, 'Data inicial')
      : null;
    const end = query.end ? parseDateOrThrow(query.end, 'Data final') : null;
    const normalized = start && end ? normalizeRange(start, end) : null;

    return this.prisma.report.findMany({
      where: {
        ...(companyId === ALL_COMPANIES_REPORT_ID
          ? {
              filters: {
                path: ['allCompanies'],
                equals: true,
              },
            }
          : companyId
            ? { companyId }
            : { companyId: { in: scopeCompanyIds } }),
        ...(query.type?.trim()
          ? { type: toReportType(query.type.trim()) }
          : {}),
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
    if (companyId && companyId !== ALL_COMPANIES_REPORT_ID) {
      this.ensureCompanyInScope(companyId, scopeCompanyIds);
    }

    return this.prisma.report.findFirst({
      where: {
        ...(companyId === ALL_COMPANIES_REPORT_ID
          ? {
              filters: {
                path: ['allCompanies'],
                equals: true,
              },
            }
          : companyId
            ? { companyId }
            : { companyId: { in: scopeCompanyIds } }),
        ...(query.type?.trim()
          ? { type: toReportType(query.type.trim()) }
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
      userId?: string | null;
    },
  ) {
    const companyId = payload.companyId?.trim();
    if (!companyId) throw new BadRequestException('companyId é obrigatório');

    const type = payload.type?.trim();
    if (!type) throw new BadRequestException('type é obrigatório');
    if (!ALLOWED_REPORT_TYPES.has(type)) {
      throw new BadRequestException(
        'Tipo de relatório inválido. Use Rendimento (1) ou Estatística Geral (4).',
      );
    }

    if (type === '4' && companyId === ALL_COMPANIES_REPORT_ID) {
      throw new BadRequestException(
        'Estatística Geral exige uma empresa específica.',
      );
    }

    const rendimentoScope =
      type === '1'
        ? await this.resolveRendimentoCompanyScope(user, companyId)
        : null;

    const scopeCompanyIds = await this.getAccessibleCompanyIds(user);
    if (type === '4') {
      this.ensureCompanyInScope(companyId, scopeCompanyIds);
    }

    const reportCompanyId =
      rendimentoScope?.representativeCompanyId ?? companyId;
    const company = await this.prisma.company.findFirst({
      where: { id: reportCompanyId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    const format = toReportFormat(payload.format?.trim() || 'XLSX');
    const reportType = toReportType(type);

    const userId = payload.userId?.trim() || null;
    if (type === '4' && userId) {
      throw new BadRequestException(
        'Estatística Geral não utiliza filtro por colaborador.',
      );
    }

    const start = parseDateOrThrow(payload.start, 'Data inicial');
    const end = parseDateOrThrow(payload.end, 'Data final');
    const range = normalizeRange(start, end);

    const reportId = randomUUID();

    const uploadsDir = join(process.cwd(), 'uploads', 'reports', reportId);

    const companyPart =
      rendimentoScope?.allCompanies
        ? 'todas-empresas'
        : safeFilenamePart(company.name) || 'empresa';
    const companyLabel =
      rendimentoScope?.displayName ?? company.name;
    const typePart =
      REPORT_TYPE_SLUGS[type] ??
      `tipo-${safeFilenamePart(reportType) || 'x'}`;
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
                    user,
                    companyId,
                    start: range.start,
                    end: range.end,
                    type,
                    userId,
                  }),
            ),
          }
        : type === '4'
          ? {
              filename: `${baseName}.csv`,
              mimeType: 'text/csv; charset=utf-8',
              buffer: Buffer.from(
                await this.generateTipo4Csv({
                  user,
                  companyId,
                  start: range.start,
                  end: range.end,
                }),
                'utf8',
              ),
            }
          : {
              filename: `${baseName}.csv`,
              mimeType: 'text/csv; charset=utf-8',
              buffer: Buffer.from(
                await this.generateHoursUsageCsv({
                  user,
                  companyId,
                  start: range.start,
                  end: range.end,
                  userId,
                }),
                'utf8',
              ),
            };

    const targetPath = join(uploadsDir, built.filename);
    await writeUploadedBuffer(targetPath, built.buffer);

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
        companyId: reportCompanyId,
        type: reportType,
        format,
        status: ReportStatus.READY,
        periodStart: range.start,
        periodEnd: range.end,
        filters: {
          companyId,
          companyLabel,
          ...(rendimentoScope?.allCompanies ? { allCompanies: true } : {}),
          type,
          format,
          start: range.start.toISOString(),
          end: range.end.toISOString(),
          ...(userId ? { userId } : {}),
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
