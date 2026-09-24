import {
  calcularNps,
  classe,
  deveEnviar,
  jaMostrouHoje,
  podeTrocarNota,
  somarMeses,
  trimestre,
} from './nps-regras';

describe('nps-regras', () => {
  it('classe segue 0–6 / 7–8 / 9–10', () => {
    expect([0, 6, 7, 8, 9, 10].map(classe)).toEqual([
      'DETRATOR',
      'DETRATOR',
      'NEUTRO',
      'NEUTRO',
      'PROMOTOR',
      'PROMOTOR',
    ]);
  });

  it('NPS: promotores menos detratores, neutros contam no total', () => {
    expect(calcularNps([])).toBeNull();
    expect(calcularNps([10, 10])).toBe(100);
    expect(calcularNps([0, 3])).toBe(-100);
    // 2 promotores, 1 neutro, 1 detrator → (2−1)/4 = 25
    expect(calcularNps([9, 10, 7, 6])).toBe(25);
  });

  it('trimestre no fuso de Brasília', () => {
    // 01/10 00:30 UTC ainda é 30/09 em Brasília → T3
    expect(trimestre(new Date('2026-10-01T00:30:00Z'))).toBe('2026-T3');
    expect(trimestre(new Date('2026-10-01T04:00:00Z'))).toBe('2026-T4');
    expect(trimestre(new Date('2026-01-15T12:00:00Z'))).toBe('2026-T1');
  });

  it('somarMeses respeita o fim do mês', () => {
    expect(somarMeses(new Date('2026-01-31T12:00:00Z'), 1).toISOString()).toBe(
      '2026-02-28T12:00:00.000Z',
    );
    expect(somarMeses(new Date('2026-11-15T12:00:00Z'), 3).toISOString()).toBe(
      '2027-02-15T12:00:00.000Z',
    );
  });

  it('deveEnviar só depois do intervalo', () => {
    const agora = new Date('2026-09-24T12:00:00Z');
    expect(deveEnviar(null, 3, agora)).toBe(true);
    expect(deveEnviar(new Date('2026-06-25T12:00:00Z'), 3, agora)).toBe(false);
    expect(deveEnviar(new Date('2026-06-24T12:00:00Z'), 3, agora)).toBe(true);
  });

  it('troca de nota por 24 h', () => {
    const agora = new Date('2026-09-24T12:00:00Z');
    expect(podeTrocarNota(null, agora)).toBe(true);
    expect(podeTrocarNota(new Date('2026-09-24T00:00:00Z'), agora)).toBe(true);
    expect(podeTrocarNota(new Date('2026-09-23T11:00:00Z'), agora)).toBe(false);
  });

  it('um pop-up por dia, virando à meia-noite de Brasília', () => {
    const agora = new Date('2026-09-24T12:00:00Z'); // 09:00 local
    expect(jaMostrouHoje(null, agora)).toBe(false);
    expect(jaMostrouHoje(new Date('2026-09-24T03:30:00Z'), agora)).toBe(true); // 00:30 local
    expect(jaMostrouHoje(new Date('2026-09-24T02:30:00Z'), agora)).toBe(false); // 23:30 de ontem
  });
});
