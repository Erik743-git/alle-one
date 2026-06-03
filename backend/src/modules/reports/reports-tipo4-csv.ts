/**
 * Exportação CSV da Estatística Geral — mesmas seções/abas do XLSX (sem gráficos embutidos).
 */

export type Tipo4MonthRow = {
  monthLabel: string;
  Infraestrutura?: number;
  NOC?: number;
  Rotinas?: number;
  Consult?: number;
  Sistema?: number;
  Total?: number;
};

export type Tipo4TriggerRow = {
  host: string;
  trigger: string;
  severity: string;
  count: number;
};

export type Tipo4ReportBundle = {
  companyName: string;
  zabbixGroup: string;
  periodLabel: string;
  periodStartIso: string;
  periodEndIso: string;
  monitoringUseWeekly: boolean;
  chamadosMonths: Tipo4MonthRow[];
  horasMonths: Tipo4MonthRow[];
  alertasMonitoringRows: Array<{
    periodLabel: string;
    High: number;
    Disaster: number;
  }>;
  dashSummary: Record<string, unknown> | undefined;
  topTriggers: Tipo4TriggerRow[];
  allTriggersInPeriod: Tipo4TriggerRow[];
  principaisHosts: Array<{
    monthLabel: string;
    High: Array<{ host: string; quantity: number }>;
    Disaster: Array<{ host: string; quantity: number }>;
  }>;
  ticketsStats: {
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
};

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  return escapeCsv(String(value));
}

function sectionTitle(title: string): string[] {
  return ['', escapeCsv(`--- ${title} ---`)];
}

function monthTableRows(rows: Tipo4MonthRow[]) {
  return rows.map((r) => [
    r.monthLabel,
    Number(r.Infraestrutura) || 0,
    Number(r.NOC) || 0,
    Number(r.Rotinas) || 0,
    Number(r.Consult) || 0,
    Number(r.Sistema) || 0,
    Number(r.Total) || 0,
  ]);
}

const MONTH_HEADERS = [
  'Mês',
  'Infraestrutura',
  'NOC',
  'Rotinas',
  'Consult',
  'Sistemas',
  'Total',
];

export function buildTipo4ReportCsv(bundle: Tipo4ReportBundle): string {
  const lines: string[] = [];
  const pushRow = (cells: (string | number | null | undefined)[]) => {
    lines.push(cells.map((c) => csvCell(c)).join(','));
  };

  lines.push(...sectionTitle('Metadados do relatório'));
  pushRow(['campo', 'valor']);
  pushRow(['tipo_relatorio', 'Estatística Geral']);
  pushRow(['empresa', bundle.companyName]);
  pushRow(['grupo_zabbix', bundle.zabbixGroup]);
  pushRow(['periodo', bundle.periodLabel]);
  pushRow(['periodo_inicio', bundle.periodStartIso]);
  pushRow(['periodo_fim', bundle.periodEndIso]);
  pushRow([
    'observacao',
    'Gráficos (barras/linhas) existem apenas no XLSX; tabelas abaixo reproduzem os dados.',
  ]);

  lines.push(...sectionTitle('Chamados por mês'));
  pushRow(MONTH_HEADERS);
  for (const row of monthTableRows(bundle.chamadosMonths)) {
    pushRow(row);
  }

  lines.push(...sectionTitle('Apontamento de horas'));
  pushRow(MONTH_HEADERS);
  for (const row of monthTableRows(bundle.horasMonths)) {
    pushRow(row);
  }

  lines.push(...sectionTitle('Monitoramento'));
  pushRow([
    bundle.monitoringUseWeekly ? 'Semana' : 'Mês',
    'High',
    'Disaster',
  ]);
  for (const r of bundle.alertasMonitoringRows) {
    pushRow([r.periodLabel, r.High, r.Disaster]);
  }

  const totalHosts = Number(bundle.dashSummary?.totalHosts) || 0;
  const totalHigh = Number(bundle.dashSummary?.totalHigh) || 0;
  const totalDisaster = Number(bundle.dashSummary?.totalDisaster) || 0;
  const totalAlerts = totalHigh + totalDisaster;
  const uniqueTriggers =
    Number(bundle.dashSummary?.totalTriggersDistintos) ||
    bundle.topTriggers.length;

  lines.push(...sectionTitle('Top Triggers — resumo do período'));
  pushRow([
    'Hosts no grupo',
    'Triggers distintos',
    'Total alertas',
    'High',
    'Disaster',
  ]);
  pushRow([
    totalHosts,
    uniqueTriggers,
    totalAlerts,
    totalHigh,
    totalDisaster,
  ]);

  lines.push(...sectionTitle('Top Triggers — top 10'));
  pushRow(['#', 'Host', 'Trigger', 'Severidade', 'Alertas']);
  bundle.topTriggers.slice(0, 10).forEach((t, i) => {
    pushRow([i + 1, t.host, t.trigger, t.severity, t.count]);
  });

  if (bundle.principaisHosts.length > 0) {
    lines.push(
      ...sectionTitle('Top Triggers — principais hosts por mês (top 3 por severidade)'),
    );
    pushRow(['Mês', 'Host', 'Severidade', 'Posição', 'Alertas']);
    for (const m of bundle.principaisHosts) {
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
        pushRow([m.monthLabel, '—', '—', '—', '—']);
        continue;
      }
      for (const e of entries) {
        pushRow([m.monthLabel, e.host, e.severity, e.pos, e.qty]);
      }
    }
  }

  lines.push(...sectionTitle('Triggers do período (detalhado)'));
  pushRow(['#', 'Host', 'Trigger', 'Severidade', 'Alertas']);
  bundle.allTriggersInPeriod.forEach((t, i) => {
    pushRow([i + 1, t.host, t.trigger, t.severity, t.count]);
  });

  lines.push(...sectionTitle('Chamados geral — resumo'));
  pushRow([
    'Abertos no período',
    'Fechados no período',
    'Em aberto (geral)',
    'Base de tickets',
  ]);
  pushRow([
    bundle.ticketsStats.openedInPeriod,
    bundle.ticketsStats.closedInPeriod,
    bundle.ticketsStats.openNowTotal,
    bundle.ticketsStats.ticketsBaseTotal,
  ]);

  lines.push(
    ...sectionTitle(
      `Chamados em aberto (geral) — ${bundle.ticketsStats.openTickets.length} registro(s)`,
    ),
  );
  pushRow([
    'Ticket',
    'Título',
    'Responsável',
    'Mesa',
    'Status',
    'Última atualização',
  ]);
  if (bundle.ticketsStats.openTickets.length === 0) {
    pushRow(['—', 'Nenhum chamado em aberto.', '—', '—', '—', '—']);
  } else {
    for (const t of bundle.ticketsStats.openTickets) {
      pushRow([
        t.ticketNumber,
        t.title ?? '—',
        t.responsibleName ?? '—',
        t.deskName ?? '—',
        t.statusName ?? '—',
        t.updatedAtSource
          ? new Date(t.updatedAtSource).toLocaleString('pt-BR')
          : '—',
      ]);
    }
  }

  return `\uFEFF${lines.join('\n')}`;
}
