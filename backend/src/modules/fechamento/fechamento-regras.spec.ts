import {
  cicloAnterior,
  cicloDoDia,
  cicloEncerrado,
  conferir,
  limitesDoCiclo,
  type ApontamentoConferencia,
} from './fechamento-regras';

function ap(p: Partial<ApontamentoConferencia>): ApontamentoConferencia {
  return {
    id: Math.random().toString(36).slice(2),
    userId: 'u1',
    nome: 'Ana',
    ticketNumber: 1,
    data: '2026-09-02', // quarta
    inicio: '09:00',
    fim: '10:00',
    servico: 'HORA NORMAL',
    criadoEm: new Date('2026-09-02T15:00:00Z'),
    ...p,
  };
}

describe('ciclo 26 → 25', () => {
  it('limites e ciclo do dia', () => {
    expect(limitesDoCiclo('2026-09')).toEqual({
      inicio: '2026-08-26',
      fim: '2026-09-25',
    });
    expect(limitesDoCiclo('2026-01')).toEqual({
      inicio: '2025-12-26',
      fim: '2026-01-25',
    });
    expect(cicloDoDia('2026-09-25')).toBe('2026-09');
    expect(cicloDoDia('2026-09-26')).toBe('2026-10');
    expect(cicloDoDia('2026-12-31')).toBe('2027-01');
    expect(cicloAnterior('2026-01')).toBe('2025-12');
  });

  it('só fecha ciclo que já acabou', () => {
    expect(cicloEncerrado('2026-09', '2026-09-25')).toBe(false);
    expect(cicloEncerrado('2026-09', '2026-09-26')).toBe(true);
  });
});

describe('conferir', () => {
  it('sobreposição entre chamados e no mesmo chamado', () => {
    const r = conferir([
      ap({ ticketNumber: 1, inicio: '09:00', fim: '11:00' }),
      ap({ ticketNumber: 2, inicio: '10:30', fim: '12:00' }),
      ap({ ticketNumber: 2, inicio: '12:00', fim: '13:00' }), // encosta, não cruza
    ]);
    const s = r.filter((a) => a.tipo === 'SOBREPOSICAO');
    expect(s).toHaveLength(1);
    expect(s[0].chamados).toEqual([1, 2]);
  });

  it('pessoas diferentes no mesmo horário não é sobreposição', () => {
    const r = conferir([
      ap({ userId: 'u1' }),
      ap({ userId: 'u2', nome: 'Bia' }),
    ]);
    expect(r.filter((a) => a.tipo === 'SOBREPOSICAO')).toHaveLength(0);
  });

  it('dia com mais de 12 h (sem contar duas vezes a sobreposição)', () => {
    expect(
      conferir([
        ap({ inicio: '06:00', fim: '18:00' }),
        ap({ inicio: '08:00', fim: '09:00' }),
      ]).some((a) => a.tipo === 'DIA_LONGO'),
    ).toBe(false);
    const r = conferir([
      ap({ inicio: '06:00', fim: '18:00' }),
      ap({ inicio: '18:00', fim: '19:30' }),
    ]);
    expect(r.find((a) => a.tipo === 'DIA_LONGO')?.detalhe).toBe(
      '13h30 lançadas no dia',
    );
  });

  it('fim de semana fora do plantão', () => {
    const r = conferir([
      ap({ data: '2026-09-05', criadoEm: new Date('2026-09-05T15:00:00Z') }), // sábado
      ap({
        data: '2026-09-06',
        servico: 'PLANTÃO',
        criadoEm: new Date('2026-09-06T15:00:00Z'),
      }),
    ]);
    const f = r.filter((a) => a.tipo === 'FIM_DE_SEMANA');
    expect(f).toHaveLength(1);
    expect(f[0].data).toBe('2026-09-05');
  });

  it('lançado depois do dia, no fuso de Brasília', () => {
    // 02:00 UTC do dia 3 ainda é dia 2 em Brasília → não é atraso
    expect(
      conferir([ap({ criadoEm: new Date('2026-09-03T02:00:00Z') })]),
    ).toHaveLength(0);
    const r = conferir([ap({ criadoEm: new Date('2026-09-05T12:00:00Z') })]);
    expect(r[0].tipo).toBe('LANCADO_DEPOIS');
    expect(r[0].detalhe).toContain('3 dias depois');
  });

  it('comunicação (início = fim) fica de fora', () => {
    expect(
      conferir([
        ap({
          inicio: '10:00',
          fim: '10:00',
          data: '2026-09-05',
          criadoEm: new Date('2026-09-09T12:00:00Z'),
        }),
      ]),
    ).toHaveLength(0);
  });
});
