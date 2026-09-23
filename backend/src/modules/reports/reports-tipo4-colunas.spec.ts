import { buildTipo4ReportCsv } from './reports-tipo4-csv';

/**
 * As colunas do relatório eram fixas (Infraestrutura, NOC, Rotinas, Consult,
 * Sistemas) e o dashboard passou a agrupar pelo nome real da mesa. Duas
 * consequências em produção: "Sistemas" não casava com o `Sistema` que o
 * relatório lia, e mesa fora da lista — Protheus/BI - Fluidra, Triagem,
 * Projetos, sem mesa — entrava no Total sem aparecer em coluna nenhuma, então
 * o cliente somava a linha e não fechava.
 */
function bundle(chamadosMonths: unknown[], horasMonths: unknown[] = []) {
  return {
    companyName: 'Empresa',
    zabbixGroup: 'grupo',
    periodLabel: 'set/2026',
    periodStartIso: '2026-09-01',
    periodEndIso: '2026-09-30',
    monitoringUseWeekly: false,
    chamadosMonths,
    horasMonths,
    alertasMonitoringRows: [],
    dashSummary: undefined,
    topTriggers: [],
    allTriggersInPeriod: [],
    principaisHosts: [],
    ticketsStats: {
      openedInPeriod: 0,
      closedInPeriod: 0,
      openNowTotal: 0,
      ticketsBaseTotal: 0,
      openTickets: [],
    },
  } as never;
}

/** Linha de cabeçalho da seção pedida. */
function cabecalho(csv: string, secao: string): string[] {
  const linhas = csv.split('\n');
  const i = linhas.findIndex((l) => l.includes(secao));
  return linhas[i + 1].split(',').map((c) => c.replace(/^"|"$/g, ''));
}

describe('Colunas do relatório tipo 4', () => {
  it('mostra as mesas que tiveram chamado, da maior para a menor', () => {
    const csv = buildTipo4ReportCsv(
      bundle([
        { monthLabel: 'set/2026', NOC: 40, Infraestrutura: 10, Total: 50 },
      ]),
    );

    expect(cabecalho(csv, 'Chamados por mês')).toEqual([
      'Mês',
      'NOC',
      'Infraestrutura',
      'Total',
    ]);
  });

  it('não cria coluna para mesa sem chamado no período', () => {
    const csv = buildTipo4ReportCsv(
      bundle([
        { monthLabel: 'set/2026', NOC: 12, Consult: 0, Projetos: 0, Total: 12 },
      ]),
    );

    const colunas = cabecalho(csv, 'Chamados por mês');
    expect(colunas).toEqual(['Mês', 'NOC', 'Total']);
    expect(colunas).not.toContain('Consult');
    expect(colunas).not.toContain('Projetos');
  });

  it('inclui mesa que não estava na lista fixa antiga', () => {
    const csv = buildTipo4ReportCsv(
      bundle([
        {
          monthLabel: 'set/2026',
          NOC: 100,
          'Protheus/BI - Fluidra': 503,
          Triagem: 119,
          Total: 722,
        },
      ]),
    );

    expect(cabecalho(csv, 'Chamados por mês')).toEqual([
      'Mês',
      'Protheus/BI - Fluidra',
      'Triagem',
      'NOC',
      'Total',
    ]);
  });

  it('a soma das colunas fecha com o Total', () => {
    const csv = buildTipo4ReportCsv(
      bundle([
        {
          monthLabel: 'set/2026',
          NOC: 10,
          Triagem: 5,
          'Sem mesa': 2,
          Total: 17,
        },
      ]),
    );

    const linhas = csv.split('\n');
    const i = linhas.findIndex((l) => l.includes('Chamados por mês'));
    const dados = linhas[i + 2].split(',').map((c) => c.replace(/^"|"$/g, ''));
    const mesas = dados.slice(1, -1).map(Number);
    const total = Number(dados[dados.length - 1]);

    expect(mesas.reduce((a, b) => a + b, 0)).toBe(total);
  });

  it('chamados e horas têm colunas próprias', () => {
    const csv = buildTipo4ReportCsv(
      bundle(
        [{ monthLabel: 'set/2026', NOC: 10, Total: 10 }],
        [{ monthLabel: 'set/2026', Infraestrutura: 8, Total: 8 }],
      ),
    );

    expect(cabecalho(csv, 'Chamados por mês')).toEqual(['Mês', 'NOC', 'Total']);
    expect(cabecalho(csv, 'Apontamento de horas')).toEqual([
      'Mês',
      'Infraestrutura',
      'Total',
    ]);
  });
});
