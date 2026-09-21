/**
 * Mesa obrigatória ao abrir chamado a partir de um e-mail.
 *
 * Abrir chamado pela tela sempre exigiu mesa (`deskId!` no DTO de criação),
 * mas abrir a partir do pré-ticket não exigia: quando o remetente não casava
 * com nenhuma regra de direcionamento, o chamado nascia sem mesa e ficava
 * fora da fila da equipe e da distribuição por mesa dos relatórios. Foram
 * 54 chamados assim em produção, entre 16 e 21/09/2026.
 */
function resolverMesa(params: {
  dtoSpecialtyId?: string;
  dtoDeskId?: string;
  /** Mesa que veio da regra de direcionamento do e-mail. */
  rowSpecialtyId?: string | null;
}): string | null {
  return (
    params.dtoSpecialtyId?.trim() ||
    params.dtoDeskId?.trim() ||
    params.rowSpecialtyId ||
    null
  );
}

/** Espelha a trava do serviço: sem mesa, não abre. */
function podeAbrir(mesa: string | null): boolean {
  return mesa != null;
}

describe('mesa ao abrir pré-ticket', () => {
  it('usa a mesa escolhida na tela', () => {
    expect(resolverMesa({ dtoSpecialtyId: 'mesa-noc' })).toBe('mesa-noc');
  });

  it('usa a mesa da regra de direcionamento quando a tela não manda', () => {
    expect(resolverMesa({ rowSpecialtyId: 'mesa-sistemas' })).toBe(
      'mesa-sistemas',
    );
  });

  it('a escolha da tela ganha da regra', () => {
    expect(
      resolverMesa({ dtoSpecialtyId: 'mesa-infra', rowSpecialtyId: 'mesa-noc' }),
    ).toBe('mesa-infra');
  });

  it('aceita o campo antigo deskId', () => {
    expect(resolverMesa({ dtoDeskId: 'mesa-rotinas' })).toBe('mesa-rotinas');
  });

  it('não abre chamado sem mesa nenhuma', () => {
    const mesa = resolverMesa({ rowSpecialtyId: null });
    expect(mesa).toBeNull();
    expect(podeAbrir(mesa)).toBe(false);
  });

  it('espaço em branco não vale como mesa', () => {
    const mesa = resolverMesa({ dtoSpecialtyId: '   ', dtoDeskId: '  ' });
    expect(podeAbrir(mesa)).toBe(false);
  });
});

/** Decide o que a tela pergunta antes de abrir. */
function oQuePerguntar(item: {
  companyName?: string | null;
  specialtyId?: string | null;
  deskId?: string | null;
}) {
  const temEmpresa = Boolean(item.companyName?.trim());
  const temMesa = Boolean(item.specialtyId?.trim() || item.deskId?.trim());
  return {
    perguntaEmpresa: !temEmpresa,
    perguntaMesa: !temMesa,
    abreDireto: temEmpresa && temMesa,
  };
}

describe('o que a tela pergunta antes de abrir', () => {
  it('abre direto quando empresa e mesa já vieram', () => {
    expect(
      oQuePerguntar({ companyName: 'Minâncora', specialtyId: 'mesa-noc' }),
    ).toEqual({ perguntaEmpresa: false, perguntaMesa: false, abreDireto: true });
  });

  it('pergunta só a mesa quando a empresa foi reconhecida', () => {
    // Caso dos #81288, #81294 e #81295: empresa certa, mesa vazia.
    expect(oQuePerguntar({ companyName: 'Wetzel' })).toEqual({
      perguntaEmpresa: false,
      perguntaMesa: true,
      abreDireto: false,
    });
  });

  it('pergunta as duas quando nada foi reconhecido', () => {
    // Caso do #81296.
    expect(oQuePerguntar({})).toEqual({
      perguntaEmpresa: true,
      perguntaMesa: true,
      abreDireto: false,
    });
  });

  it('o campo antigo deskId também conta como mesa', () => {
    expect(
      oQuePerguntar({ companyName: 'Tuper', deskId: 'mesa-infra' }).abreDireto,
    ).toBe(true);
  });
});
