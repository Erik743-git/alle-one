import { intervaloAtual, intervaloDoMesExibido } from './periodo-horas';

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const faixa = (i: { start: Date; end: Date }) =>
  `${ymd(i.start)}..${ymd(i.end)}`;

describe('periodo-horas', () => {
  it('mês civil vai do dia 1 ao último dia', () => {
    expect(faixa(intervaloAtual('mes', new Date(2026, 8, 28)))).toBe(
      '2026-09-01..2026-09-30',
    );
    expect(faixa(intervaloDoMesExibido('mes', new Date(2026, 1, 10)))).toBe(
      '2026-02-01..2026-02-28',
    );
  });

  it('lista: folha é o ciclo que contém a data', () => {
    expect(faixa(intervaloAtual('folha', new Date(2026, 8, 28)))).toBe(
      '2026-09-26..2026-10-25',
    );
    expect(faixa(intervaloAtual('folha', new Date(2026, 8, 25)))).toBe(
      '2026-08-26..2026-09-25',
    );
  });

  it('Excel: folha é o ciclo que termina no mês exibido', () => {
    expect(faixa(intervaloDoMesExibido('folha', new Date(2026, 8, 28)))).toBe(
      '2026-08-26..2026-09-25',
    );
    expect(faixa(intervaloDoMesExibido('folha', new Date(2026, 0, 3)))).toBe(
      '2025-12-26..2026-01-25',
    );
  });
});
