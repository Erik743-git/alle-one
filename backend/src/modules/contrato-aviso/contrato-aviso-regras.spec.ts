import {
  FAIXA_DIA15,
  chaveNome,
  deveAvisarDia15,
  ehJanelaDia15,
  faixasParaAvisar,
  horasDaEspecialidade,
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

  it('faixas 50, 80 e 100, sem repetir; pulo avisa só a mais alta', () => {
    expect(faixasParaAvisar(49.9, [])).toEqual({ registrar: [], avisar: null });
    expect(faixasParaAvisar(50, [])).toEqual({ registrar: [50], avisar: 50 });
    expect(faixasParaAvisar(60, [50])).toEqual({ registrar: [], avisar: null });
    expect(faixasParaAvisar(85, [50])).toEqual({ registrar: [80], avisar: 80 });
    expect(faixasParaAvisar(130, [])).toEqual({
      registrar: [50, 80, 100],
      avisar: 100,
    });
    expect(faixasParaAvisar(130, [50, 80, 100])).toEqual({
      registrar: [],
      avisar: null,
    });
    expect(faixasParaAvisar(null, [])).toEqual({ registrar: [], avisar: null });
  });

  it('o aviso do dia 15 não conta como faixa passada', () => {
    // Linha avisada no dia 15 (faixa 0) e depois passando de 50%: avisa 50.
    expect(faixasParaAvisar(55, [FAIXA_DIA15])).toEqual({
      registrar: [50],
      avisar: 50,
    });
  });
});

describe('aviso do dia 15', () => {
  // 15/09 08:20 de Brasília = 11:20 UTC.
  const dia15as8 = new Date('2026-09-15T11:20:00Z');

  it('janela: dia 15 a partir das 8h de Brasília', () => {
    expect(ehJanelaDia15(new Date('2026-09-15T10:59:00Z'))).toBe(false); // 07:59
    expect(ehJanelaDia15(dia15as8)).toBe(true);
    expect(ehJanelaDia15(new Date('2026-09-15T23:00:00Z'))).toBe(true); // 20h
    expect(ehJanelaDia15(new Date('2026-09-16T11:20:00Z'))).toBe(false);
    // 15/09 01:00 UTC ainda é 14/09 22h em Brasília.
    expect(ehJanelaDia15(new Date('2026-09-15T01:00:00Z'))).toBe(false);
  });

  it('só com 50% ou menos, e uma vez no mês', () => {
    expect(deveAvisarDia15({ agora: dia15as8, pct: 50, jaAvisadas: [] })).toBe(
      true,
    );
    expect(deveAvisarDia15({ agora: dia15as8, pct: 12, jaAvisadas: [] })).toBe(
      true,
    );
    expect(
      deveAvisarDia15({ agora: dia15as8, pct: 50.1, jaAvisadas: [] }),
    ).toBe(false);
    expect(
      deveAvisarDia15({ agora: dia15as8, pct: 10, jaAvisadas: [FAIXA_DIA15] }),
    ).toBe(false);
  });
});

describe('horas da linha', () => {
  const porMesa = [
    { deskName: 'Sistemas', totalMinutes: 600 },
    { deskName: 'Infraestrutura', totalMinutes: 90 },
  ];

  it('pega a mesa com o nome da especialidade, sem ligar para caixa e acento', () => {
    expect(horasDaEspecialidade(porMesa, 'sistemas')).toBe(10);
    expect(horasDaEspecialidade(porMesa, 'INFRAESTRUTURA')).toBe(1.5);
    expect(chaveNome('  Informática ')).toBe(chaveNome('informatica'));
  });

  it('especialidade sem apontamento no mês: zero', () => {
    expect(horasDaEspecialidade(porMesa, 'NOC')).toBe(0);
    expect(horasDaEspecialidade(undefined, 'NOC')).toBe(0);
    // 1h10 de 2h: 58,3% (antes arredondava as horas e dava 58,5%).
    const h = horasDaEspecialidade(
      [{ deskName: 'Sistemas', totalMinutes: 70 }],
      'sistemas',
    );
    expect(percentual(h, 2)).toBe(58.3);
    expect(
      percentual(
        horasDaEspecialidade(
          [{ deskName: 'Sistemas', totalMinutes: 125 }],
          'sistemas',
        ),
        2,
      ),
    ).toBe(104.2);
  });
});
