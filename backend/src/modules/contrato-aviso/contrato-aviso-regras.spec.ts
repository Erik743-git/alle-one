import {
  faixasParaAvisar,
  mesBrasilia,
  percentual,
} from './contrato-aviso-regras';

describe('contrato-aviso-regras', () => {
  it('mês de Brasília vira à meia-noite local', () => {
    const m = mesBrasilia(new Date('2026-10-01T02:00:00Z')); // 30/09 23:00 local
    expect(m.mes).toBe('2026-09');
    expect(m.inicio.toISOString()).toBe('2026-09-01T03:00:00.000Z');
    expect(m.fim.toISOString()).toBe('2026-10-01T02:59:59.999Z');
    expect(mesBrasilia(new Date('2026-10-01T03:00:00Z')).mes).toBe('2026-10');
  });

  it('percentual com uma casa; sem horas contratadas não há percentual', () => {
    expect(percentual(16, 20)).toBe(80);
    expect(percentual(1, 3)).toBe(33.3);
    expect(percentual(5, 0)).toBeNull();
  });

  it('faixas: 80, depois 100, sem repetir; pulo direto avisa só 100', () => {
    expect(faixasParaAvisar(79.9, [])).toEqual({ registrar: [], avisar: null });
    expect(faixasParaAvisar(80, [])).toEqual({ registrar: [80], avisar: 80 });
    expect(faixasParaAvisar(95, [80])).toEqual({ registrar: [], avisar: null });
    expect(faixasParaAvisar(100, [80])).toEqual({
      registrar: [100],
      avisar: 100,
    });
    expect(faixasParaAvisar(130, [])).toEqual({
      registrar: [80, 100],
      avisar: 100,
    });
    expect(faixasParaAvisar(130, [80, 100])).toEqual({
      registrar: [],
      avisar: null,
    });
    expect(faixasParaAvisar(null, [])).toEqual({ registrar: [], avisar: null });
  });
});
