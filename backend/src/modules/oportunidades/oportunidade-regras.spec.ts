import {
  anoCivil,
  colunaDaReabertura,
  deveFecharSozinho,
  motivoDoAlerta,
  problemaNoMovimento,
  type MovimentoInput,
} from './oportunidade-regras';

const DIA = 24 * 60 * 60 * 1000;
const agora = new Date('2026-09-25T15:00:00Z');
const diasAtras = (n: number) => new Date(agora.getTime() - n * DIA);

function mov(over: Partial<MovimentoInput>): MovimentoInput {
  return {
    atual: 'EM_ANALISE',
    para: 'PROPOSTA',
    tipo: 'CONTRATO',
    motivoReprova: null,
    motivoReprovaTexto: null,
    ...over,
  };
}

describe('problemaNoMovimento', () => {
  it('movimento livre entre colunas abertas', () => {
    expect(problemaNoMovimento(mov({}))).toBeNull();
    expect(
      problemaNoMovimento(mov({ atual: 'PROPOSTA', para: 'EM_ANALISE' })),
    ).toBeNull();
    expect(
      problemaNoMovimento(mov({ atual: 'PENDENTE', para: 'APROVADO' })),
    ).toBeNull();
  });

  it('não volta para Pendente', () => {
    expect(problemaNoMovimento(mov({ para: 'PENDENTE' }))).toMatch(/não volta/);
  });

  it('tipo obrigatório para sair de Pendente', () => {
    expect(
      problemaNoMovimento(
        mov({ atual: 'PENDENTE', para: 'EM_ANALISE', tipo: null }),
      ),
    ).toMatch(/tipo/);
  });

  it('reprovar exige motivo; "outro" exige texto', () => {
    expect(problemaNoMovimento(mov({ para: 'REPROVADO' }))).toMatch(/motivo/);
    expect(
      problemaNoMovimento(mov({ para: 'REPROVADO', motivoReprova: 'OUTRO' })),
    ).toMatch(/Descreva/);
    expect(
      problemaNoMovimento(mov({ para: 'REPROVADO', motivoReprova: 'PRECO' })),
    ).toBeNull();
  });

  it('fechar só a partir de Aprovado ou Reprovado; fechado só reabre', () => {
    expect(problemaNoMovimento(mov({ para: 'FECHADO' }))).toMatch(
      /aprovado ou reprovado/,
    );
    expect(
      problemaNoMovimento(mov({ atual: 'APROVADO', para: 'FECHADO' })),
    ).toBeNull();
    expect(
      problemaNoMovimento(mov({ atual: 'FECHADO', para: 'APROVADO' })),
    ).toMatch(/Reabrir/);
  });
});

describe('fechamento automático', () => {
  it('2 dias corridos em Aprovado ou Reprovado', () => {
    expect(
      deveFecharSozinho(
        { estagio: 'APROVADO', estagioDesde: diasAtras(2) },
        agora,
      ),
    ).toBe(true);
    expect(
      deveFecharSozinho(
        { estagio: 'REPROVADO', estagioDesde: diasAtras(1.9) },
        agora,
      ),
    ).toBe(false);
    expect(
      deveFecharSozinho(
        { estagio: 'PROPOSTA', estagioDesde: diasAtras(90) },
        agora,
      ),
    ).toBe(false);
  });
});

describe('alertas', () => {
  const card = (over: object) => ({
    estagio: 'PENDENTE' as const,
    estagioDesde: diasAtras(1),
    ultimaMovimentacao: diasAtras(1),
    alertaEnviadoEm: null as Date | null,
    ...over,
  });

  it('15 dias em Pendente', () => {
    expect(motivoDoAlerta(card({ estagioDesde: diasAtras(15) }), agora)).toBe(
      'PENDENTE_15_DIAS',
    );
    expect(
      motivoDoAlerta(card({ estagioDesde: diasAtras(14) }), agora),
    ).toBeNull();
  });

  it('30 dias sem alteração em qualquer coluna em andamento', () => {
    expect(
      motivoDoAlerta(
        card({ estagio: 'AGUARDO_CLIENTE', ultimaMovimentacao: diasAtras(30) }),
        agora,
      ),
    ).toBe('PARADO_30_DIAS');
  });

  it('aprovado, reprovado e fechado nunca alertam', () => {
    for (const estagio of ['APROVADO', 'REPROVADO', 'FECHADO'] as const) {
      expect(
        motivoDoAlerta(
          card({ estagio, ultimaMovimentacao: diasAtras(90) }),
          agora,
        ),
      ).toBeNull();
    }
  });

  it('repete só depois de uma semana', () => {
    const base = { estagioDesde: diasAtras(20) };
    expect(
      motivoDoAlerta(card({ ...base, alertaEnviadoEm: diasAtras(6) }), agora),
    ).toBeNull();
    expect(
      motivoDoAlerta(card({ ...base, alertaEnviadoEm: diasAtras(7) }), agora),
    ).toBe('PENDENTE_15_DIAS');
  });
});

describe('reabertura e período', () => {
  it('volta para a última coluna antes de fechar', () => {
    expect(colunaDaReabertura('REPROVADO')).toBe('REPROVADO');
    expect(colunaDaReabertura('APROVADO')).toBe('APROVADO');
    expect(colunaDaReabertura(null)).toBe('APROVADO');
  });

  it('ano civil em Brasília: 31/12 às 22h ainda é o ano velho', () => {
    const { inicio, fim } = anoCivil(new Date('2027-01-01T01:00:00Z'));
    expect(inicio.toISOString()).toBe('2026-01-01T03:00:00.000Z');
    expect(fim.toISOString()).toBe('2027-01-01T03:00:00.000Z');
  });
});
