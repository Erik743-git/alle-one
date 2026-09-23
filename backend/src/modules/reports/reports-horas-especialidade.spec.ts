import * as ExcelJS from 'exceljs';
import { ReportsService } from './reports.service';

/**
 * A aba "Horas por Especialidade" cruza cliente x especialidade a partir das
 * mesmas linhas da aba detalhada. O que importa aqui é o cruzamento: se ele
 * errar, o número vai para o cliente ou para a equipe errada e ninguém percebe
 * olhando a planilha.
 */
type Linha = { client: string; equipe: string; durationMinutes: number };

function montar(rows: Linha[]) {
  const workbook = new ExcelJS.Workbook();
  // O método só usa `workbook` e `rows`; não precisa das dependências do
  // serviço para exercitar a agregação.
  (
    ReportsService.prototype as unknown as {
      addHorasPorEspecialidadeSheet: (wb: ExcelJS.Workbook, r: Linha[]) => void;
    }
  ).addHorasPorEspecialidadeSheet.call(
    Object.create(ReportsService.prototype),
    workbook,
    rows,
  );
  return workbook.getWorksheet('Horas por Especialidade')!;
}

/** Excel guarda duração em fração de dia. */
const minutos = (valor: unknown) => Math.round(Number(valor) * 1440);

describe('aba Horas por Especialidade', () => {
  it('soma as horas no cruzamento certo de cliente e especialidade', () => {
    const sheet = montar([
      { client: 'Fluidra', equipe: 'Sistemas', durationMinutes: 60 },
      { client: 'Fluidra', equipe: 'Sistemas', durationMinutes: 30 },
      { client: 'Fluidra', equipe: 'NOC', durationMinutes: 120 },
      { client: 'Zanotti', equipe: 'NOC', durationMinutes: 45 },
    ]);

    const cabecalho = sheet.getRow(3).values as unknown[];
    expect(cabecalho[1]).toBe('Cliente');
    // NOC tem mais horas no total (165) que Sistemas (90), então vem antes.
    expect(cabecalho[2]).toBe('NOC');
    expect(cabecalho[3]).toBe('Sistemas');
    expect(cabecalho[4]).toBe('Total');

    // Fluidra (210) acima de Zanotti (45).
    const fluidra = sheet.getRow(4);
    expect(fluidra.getCell(1).value).toBe('Fluidra');
    expect(minutos(fluidra.getCell(2).value)).toBe(120);
    expect(minutos(fluidra.getCell(3).value)).toBe(90);
    expect(minutos(fluidra.getCell(4).value)).toBe(210);

    const zanotti = sheet.getRow(5);
    expect(zanotti.getCell(1).value).toBe('Zanotti');
    expect(minutos(zanotti.getCell(2).value)).toBe(45);
  });

  it('deixa vazia a célula da especialidade que não trabalhou no cliente', () => {
    const sheet = montar([
      { client: 'Fluidra', equipe: 'Sistemas', durationMinutes: 60 },
      { client: 'Zanotti', equipe: 'NOC', durationMinutes: 60 },
    ]);

    // Zanotti não tem hora de Sistemas: célula vazia, não 0:00 — um zero seria
    // lido como apontamento de duração nula.
    const zanotti = sheet.getRow(5);
    expect(zanotti.getCell(1).value).toBe('Zanotti');
    const semHora = [2, 3].find(
      (c) => sheet.getRow(4).getCell(c).value === null,
    );
    expect(semHora).toBeDefined();
    expect(zanotti.getCell(semHora === 2 ? 3 : 2).value).toBeNull();
  });

  it('nomeia o que vem sem cliente ou sem equipe em vez de sumir com a hora', () => {
    const sheet = montar([
      { client: '', equipe: '', durationMinutes: 30 },
      { client: 'Fluidra', equipe: 'NOC', durationMinutes: 30 },
    ]);

    const clientes = [4, 5].map((r) => sheet.getRow(r).getCell(1).value);
    expect(clientes).toContain('Sem cliente');

    const cabecalho = sheet.getRow(3).values as unknown[];
    expect(cabecalho).toContain('Sem equipe');
  });

  it('ignora apontamento sem duração', () => {
    const sheet = montar([
      { client: 'Fluidra', equipe: 'NOC', durationMinutes: 0 },
      { client: 'Fluidra', equipe: 'NOC', durationMinutes: 60 },
    ]);

    expect(minutos(sheet.getRow(4).getCell(2).value)).toBe(60);
  });

  it('avisa em vez de entregar grade vazia quando não há apontamento', () => {
    const sheet = montar([]);

    expect(String(sheet.getCell('A3').value)).toContain('Sem apontamentos');
    // Sem cabeçalho de dado: grade vazia com colunas é pior que a frase.
    expect(sheet.getRow(3).getCell(2).value).toBeNull();
  });

  it('fecha o total de cada especialidade com a soma das linhas', () => {
    const rows: Linha[] = [
      { client: 'Fluidra', equipe: 'NOC', durationMinutes: 120 },
      { client: 'Zanotti', equipe: 'NOC', durationMinutes: 45 },
      { client: 'Zanotti', equipe: 'Sistemas', durationMinutes: 15 },
    ];
    const sheet = montar(rows);

    // A linha de Total usa SUBTOTAL para acompanhar o filtro; o que dá para
    // conferir aqui é o intervalo — se ele não cobrir todas as linhas de
    // dado, o total sai menor e ninguém nota.
    const totalRow = sheet.getRow(6);
    expect(totalRow.getCell(1).value).toBe('Total');
    const formula = (totalRow.getCell(2).value as { formula: string }).formula;
    expect(formula).toBe('SUBTOTAL(109,B4:B5)');
  });
});
