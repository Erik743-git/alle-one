/**
 * Exportação CSV da Estatística Geral — mesmas seções/abas do XLSX (sem gráficos embutidos).
 */

/**
 * Uma linha por mês. As mesas são chaves dinâmicas — o dashboard agrupa pelo
 * nome real da mesa, e ele muda conforme a empresa e o período. Só `monthLabel`
 * e `Total` são fixos.
 */
export type Tipo4MonthRow = {
  monthLabel: string;
  Total?: number;
  [mesa: string]: string | number | undefined;
};

export type Tipo4TriggerRow = {
  host: string;
  trigger: string;
  severity: string;
  count: number;
};

export type Tipo4ZabbixSlice = {
  group: string;
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
};

export type Tipo4ReportBundle = {
  companyName: string;
  zabbixGroup: string;
  /** Quando a empresa tem vários grupos Zabbix, um slice por grupo. */
  zabbixSlices?: Tipo4ZabbixSlice[];
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

/** Campos que não são mesa; o resto das chaves numéricas é. */
const CAMPOS_RESERVADOS = new Set(['monthLabel', 'Total']);

/**
 * Mesas com movimento no período, da maior para a menor — mesma regra do
 * XLSX, para os dois formatos do mesmo relatório não divergirem. Mesa sem
 * chamado no filtro escolhido não vira coluna.
 */
function mesasComMovimento(rows: Tipo4MonthRow[]): string[] {
  const totais = new Map<string, number>();
  for (const row of rows) {
    for (const [chave, valor] of Object.entries(row)) {
      if (CAMPOS_RESERVADOS.has(chave) || typeof valor !== 'number') continue;
      totais.set(chave, (totais.get(chave) ?? 0) + valor);
    }
  }
  return [...totais.entries()]
    .filter(([, total]) => total > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([mesa]) => mesa);
}

function monthTableRows(rows: Tipo4MonthRow[], mesas: string[]) {
  return rows.map((r) => [
    r.monthLabel,
    ...mesas.map((mesa) => Number((r as Record<string, unknown>)[mesa]) || 0),
    Number(r.Total) || 0,
  ]);
}

function monthHeaders(mesas: string[]): string[] {
  return ['Mês', ...mesas, 'Total'];
}

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

  const mesasChamados = mesasComMovimento(bundle.chamadosMonths);
  lines.push(...sectionTitle('Chamados por mês'));
  pushRow(monthHeaders(mesasChamados));
  for (const row of monthTableRows(bundle.chamadosMonths, mesasChamados)) {
    pushRow(row);
  }

  const mesasHoras = mesasComMovimento(bundle.horasMonths);
  lines.push(...sectionTitle('Apontamento de horas'));
  pushRow(monthHeaders(mesasHoras));
  for (const row of monthTableRows(bundle.horasMonths, mesasHoras)) {
    pushRow(row);
  }

  const slices: Tipo4ZabbixSlice[] =
    bundle.zabbixSlices && bundle.zabbixSlices.length > 0
      ? bundle.zabbixSlices
      : [
          {
            group: bundle.zabbixGroup,
            alertasMonitoringRows: bundle.alertasMonitoringRows,
            dashSummary: bundle.dashSummary,
            topTriggers: bundle.topTriggers,
            allTriggersInPeriod: bundle.allTriggersInPeriod,
            principaisHosts: bundle.principaisHosts,
          },
        ];

  for (const slice of slices) {
    const suffix = slices.length > 1 ? ` — ${slice.group}` : '';

    lines.push(...sectionTitle(`Monitoramento${suffix}`));
    pushRow([
      'Grupo Zabbix',
      bundle.monitoringUseWeekly ? 'Semana' : 'Mês',
      'High',
      'Disaster',
    ]);
    for (const r of slice.alertasMonitoringRows) {
      pushRow([slice.group, r.periodLabel, r.High, r.Disaster]);
    }

    const totalHosts = Number(slice.dashSummary?.totalHosts) || 0;
    const totalHigh = Number(slice.dashSummary?.totalHigh) || 0;
    const totalDisaster = Number(slice.dashSummary?.totalDisaster) || 0;
    const totalAlerts = totalHigh + totalDisaster;
    const uniqueTriggers =
      Number(slice.dashSummary?.totalTriggersDistintos) ||
      slice.topTriggers.length;

    lines.push(...sectionTitle(`Top Triggers — resumo do período${suffix}`));
    pushRow([
      'Grupo Zabbix',
      'Hosts no grupo',
      'Triggers distintos',
      'Total alertas',
      'High',
      'Disaster',
    ]);
    pushRow([
      slice.group,
      totalHosts,
      uniqueTriggers,
      totalAlerts,
      totalHigh,
      totalDisaster,
    ]);

    lines.push(...sectionTitle(`Top Triggers — top 10${suffix}`));
    pushRow(['#', 'Grupo Zabbix', 'Host', 'Trigger', 'Severidade', 'Alertas']);
    slice.topTriggers.slice(0, 10).forEach((t, i) => {
      pushRow([i + 1, slice.group, t.host, t.trigger, t.severity, t.count]);
    });

    if (slice.principaisHosts.length > 0) {
      lines.push(
        ...sectionTitle(
          `Top Triggers — principais hosts por mês (top 3 por severidade)${suffix}`,
        ),
      );
      pushRow([
        'Grupo Zabbix',
        'Mês',
        'Host',
        'Severidade',
        'Posição',
        'Alertas',
      ]);
      for (const m of slice.principaisHosts) {
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
          pushRow([slice.group, m.monthLabel, '—', '—', '—', '—']);
          continue;
        }
        for (const e of entries) {
          pushRow([
            slice.group,
            m.monthLabel,
            e.host,
            e.severity,
            e.pos,
            e.qty,
          ]);
        }
      }
    }
  }

  lines.push(...sectionTitle('Triggers do período (detalhado)'));
  pushRow(['#', 'Grupo Zabbix', 'Host', 'Trigger', 'Severidade', 'Alertas']);
  let triggerIdx = 0;
  for (const slice of slices) {
    for (const t of slice.allTriggersInPeriod) {
      triggerIdx += 1;
      pushRow([
        triggerIdx,
        slice.group,
        t.host,
        t.trigger,
        t.severity,
        t.count,
      ]);
    }
  }

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
