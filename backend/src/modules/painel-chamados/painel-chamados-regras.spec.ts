import {
  CHAVE_SEM,
  SEM_RESPONSAVEL,
  ehRotina,
  filtrarParados,
  horasParado,
  lerBooleano,
  lerVisao,
  montarChamadoParado,
  paraRelogioDeBrasilia,
  totaisParados,
} from './painel-chamados-regras';

const agora = new Date('2026-09-28T15:00:00Z');

function linha(over: Partial<Parameters<typeof montarChamadoParado>[0]> = {}) {
  return montarChamadoParado(
    {
      ticket_number: 1,
      title: 'Servidor fora',
      client_external_id: 10,
      client_name: 'Fluidra',
      responsible_external_id: 99,
      responsible_name: 'Otávio',
      aberto_em: new Date('2026-09-28T12:00:00Z'),
      ...over,
    },
    agora,
  );
}

describe('rotina fica fora dos parados', () => {
  const base = {
    criadoPor: 'u1',
    formaAbertura: null,
    titulo: 'Servidor fora',
    automacaoId: 'auto',
  };

  it('aberta pela automação do portal', () => {
    expect(ehRotina({ ...base, criadoPor: 'auto' })).toBe(true);
  });

  it('rotina antiga do TiFlux, pela forma de abertura', () => {
    expect(ehRotina({ ...base, formaAbertura: 'Recurrent activity' })).toBe(
      true,
    );
  });

  it('rotina antiga do TiFlux que veio só com [ROTINAS] no título', () => {
    // A "[ROTINAS] [Elmeca] Validação Backup" entrou com a forma de abertura vazia.
    expect(
      ehRotina({ ...base, titulo: '[ROTINAS] [Elmeca] Validação Backup' }),
    ).toBe(true);
  });

  it('chamado comum não é rotina', () => {
    expect(ehRotina(base)).toBe(false);
  });

  it('sem usuário de automação criado ainda, não confunde ninguém com rotina', () => {
    expect(ehRotina({ ...base, criadoPor: null, automacaoId: null })).toBe(
      false,
    );
  });
});

describe('tempo parado', () => {
  it('conta horas corridas, para baixo', () => {
    expect(horasParado(new Date('2026-09-26T15:01:00Z'), agora)).toBe(47);
    expect(horasParado(new Date('2026-09-26T15:00:00Z'), agora)).toBe(48);
  });

  it('48h certinhas ainda não passaram de 48h; 49h sim', () => {
    expect(linha({ aberto_em: new Date('2026-09-26T15:00:00Z') }).mais48h).toBe(
      false,
    );
    expect(linha({ aberto_em: new Date('2026-09-26T14:00:00Z') }).mais48h).toBe(
      true,
    );
  });
});

describe('sem responsável', () => {
  it('sem id e sem nome vira o grupo "Sem responsável"', () => {
    const l = linha({ responsible_external_id: null, responsible_name: '  ' });
    expect(l.semResponsavel).toBe(true);
    expect(l.responsavel).toBe(SEM_RESPONSAVEL);
    expect(l.responsavelChave).toBe(CHAVE_SEM);
  });

  it('só com nome (sem id) continua tendo responsável', () => {
    const l = linha({
      responsible_external_id: null,
      responsible_name: 'Breno',
    });
    expect(l.semResponsavel).toBe(false);
    expect(l.responsavelChave).toBe('nome:breno');
  });

  it('mesma pessoa com dois ids fica numa linha só (chave pelo nome)', () => {
    const a = linha({
      responsible_external_id: 10,
      responsible_name: 'Mirella',
    });
    const b = linha({
      responsible_external_id: 99,
      responsible_name: 'mirella ',
    });
    expect(a.responsavelChave).toBe(b.responsavelChave);
  });
});

describe('filtros e totais', () => {
  const linhas = [
    linha({ ticket_number: 1, aberto_em: new Date('2026-09-20T00:00:00Z') }),
    linha({ ticket_number: 2, client_external_id: 20, client_name: 'Zanotti' }),
    linha({
      ticket_number: 3,
      responsible_external_id: null,
      responsible_name: null,
    }),
  ];

  it('filtra por empresa, responsável e mais de 48h', () => {
    expect(
      filtrarParados(linhas, { empresa: '20' }).map((l) => l.ticketNumber),
    ).toEqual([2]);
    expect(
      filtrarParados(linhas, { responsavel: CHAVE_SEM }).map(
        (l) => l.ticketNumber,
      ),
    ).toEqual([3]);
    expect(
      filtrarParados(linhas, { so48h: true }).map((l) => l.ticketNumber),
    ).toEqual([1]);
  });

  it('contador do topo', () => {
    expect(totaisParados(linhas)).toEqual({
      total: 3,
      mais48h: 1,
      semResponsavel: 1,
    });
  });
});

describe('planilha e query string', () => {
  it('Excel sai no relógio de Brasília, não em UTC', () => {
    expect(
      paraRelogioDeBrasilia('2026-09-28T11:46:00.000Z').toISOString(),
    ).toBe('2026-09-28T08:46:00.000Z');
  });

  it('lê visão e booleano da URL', () => {
    expect(lerVisao('responsavel')).toBe('responsavel');
    expect(lerVisao('qualquer')).toBe('empresa');
    expect(lerBooleano('true')).toBe(true);
    expect(lerBooleano(undefined)).toBe(false);
  });
});
