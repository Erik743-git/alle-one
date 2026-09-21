import {
  SEM_MESA,
  addToDesk,
  deskNamesFromRows,
  fillMissingDesks,
  getDeskNameFromTicket,
  normalizeDeskName,
  sqlDeskNameExpression,
  type MonthlyDeskBreakdownRow,
} from './desk-categories';

/** Igual ao que o dashboard recebe: o nome da mesa vem dentro de `desk`. */
function ticket(deskName: unknown) {
  return { desk: { name: deskName } };
}

function linha(monthKey: string): MonthlyDeskBreakdownRow {
  return { monthKey, monthLabel: monthKey, Total: 0 };
}

describe('mesa do chamado', () => {
  it('usa o nome da mesa como está cadastrado', () => {
    // Antes só existiam 5 categorias adivinhadas por palavra-chave e toda
    // mesa fora dessa lista virava "Sistema" — Projetos, Alleone, Triagem
    // e Protheus/BI - Fluidra ficavam escondidas lá dentro.
    expect(getDeskNameFromTicket(ticket('Projetos'))).toBe('Projetos');
    expect(getDeskNameFromTicket(ticket('Alleone'))).toBe('Alleone');
    expect(getDeskNameFromTicket(ticket('Triagem'))).toBe('Triagem');
    expect(getDeskNameFromTicket(ticket('Protheus/BI - Fluidra'))).toBe(
      'Protheus/BI - Fluidra',
    );
    expect(getDeskNameFromTicket(ticket('Sistemas'))).toBe('Sistemas');
  });

  it('chamado sem mesa cai em "Sem mesa"', () => {
    expect(getDeskNameFromTicket(ticket('   '))).toBe(SEM_MESA);
    expect(getDeskNameFromTicket(ticket(null))).toBe(SEM_MESA);
    expect(getDeskNameFromTicket({})).toBe(SEM_MESA);
  });

  it('mesa com nome de campo da linha não sequestra o campo', () => {
    // Uma mesa chamada "Total" apagaria o total do mês.
    expect(normalizeDeskName('Total')).toBe(SEM_MESA);
    expect(normalizeDeskName('monthLabel')).toBe(SEM_MESA);
  });
});

describe('linha mensal por mesa', () => {
  it('soma na mesa e no total', () => {
    const row = linha('2026-09');
    addToDesk(row, 'Projetos', 3);
    addToDesk(row, 'NOC', 2);
    addToDesk(row, 'Projetos', 1);

    expect(row.Projetos).toBe(4);
    expect(row.NOC).toBe(2);
    expect(row.Total).toBe(6);
  });

  it('zera a mesa nos meses sem movimento', () => {
    const jan = linha('2026-01');
    const fev = linha('2026-02');
    addToDesk(jan, 'Projetos', 5);
    addToDesk(fev, 'NOC', 2);

    const rows = [jan, fev];
    fillMissingDesks(rows, deskNamesFromRows(rows));

    // Sem isso o gráfico fica com buraco no mês em que a mesa não teve nada.
    expect(fev.Projetos).toBe(0);
    expect(jan.NOC).toBe(0);
  });

  it('lista as mesas da que mais aparece para a que menos', () => {
    const jan = linha('2026-01');
    addToDesk(jan, 'NOC', 2);
    addToDesk(jan, 'Projetos', 9);
    addToDesk(jan, 'Rotinas', 5);

    expect(deskNamesFromRows([jan])).toEqual(['Projetos', 'Rotinas', 'NOC']);
  });

  it('não confunde campo da linha com mesa', () => {
    const jan = linha('2026-01');
    addToDesk(jan, 'Projetos', 4);
    expect(deskNamesFromRows([jan])).toEqual(['Projetos']);
  });
});

describe('sqlDeskNameExpression', () => {
  it('espelha o fallback de "Sem mesa" do lado do banco', () => {
    expect(sqlDeskNameExpression('t')).toBe(
      `coalesce(nullif(trim(t.desk_name), ''), '${SEM_MESA}')`,
    );
  });
});
