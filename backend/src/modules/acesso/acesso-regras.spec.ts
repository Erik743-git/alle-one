import {
  modulosDesligados,
  problemaNaLinha,
  type LinhaAcesso,
} from './acesso-regras';
import { MODULOS_PORTAL } from './modulos-portal';

function linha(chave: string, extra: Partial<LinhaAcesso> = {}): LinhaAcesso {
  return {
    chave,
    emConstrucao: false,
    colaborador: true,
    terceiro: true,
    clienteGestor: true,
    clienteMembro: true,
    ...extra,
  };
}

const tudoLigado = MODULOS_PORTAL.map((m) => linha(m.chave));

describe('modulosDesligados', () => {
  it('admin nunca tem módulo desligado', () => {
    expect(modulosDesligados('ADMIN', [])).toEqual([]);
  });

  it('em construção some para todo perfil que não é admin', () => {
    const linhas = tudoLigado.map((l) =>
      l.chave === 'financeiro' ? { ...l, emConstrucao: true } : l,
    );
    for (const role of [
      'COLLABORATOR',
      'PJ',
      'CLIENT_GESTOR',
      'CLIENT_MEMBER',
    ]) {
      expect(modulosDesligados(role, linhas)).toContain('financeiro');
    }
  });

  it('coluna do perfil desligada tira o módulo só daquele perfil', () => {
    const linhas = tudoLigado.map((l) =>
      l.chave === 'gmud' ? { ...l, clienteMembro: false } : l,
    );
    expect(modulosDesligados('CLIENT_MEMBER', linhas)).toContain('gmud');
    expect(modulosDesligados('CLIENT_GESTOR', linhas)).not.toContain('gmud');
  });

  it('perfil fora do catálogo fica travado mesmo marcado no banco', () => {
    expect(modulosDesligados('CLIENT_GESTOR', tudoLigado)).toEqual(
      expect.arrayContaining([
        'agendas',
        'mural',
        'oportunidades',
        'pre-tickets',
        'relatorios',
      ]),
    );
    expect(modulosDesligados('PJ', tudoLigado)).toContain('agendas');
    expect(modulosDesligados('COLLABORATOR', tudoLigado)).toEqual([]);
  });

  it('módulo sem linha no banco conta como desligado', () => {
    expect(modulosDesligados('COLLABORATOR', [])).toHaveLength(
      MODULOS_PORTAL.length,
    );
  });

  it('papel antigo CLIENT segue o cliente membro; papel desconhecido perde tudo', () => {
    const linhas = tudoLigado.map((l) =>
      l.chave === 'tickets' ? { ...l, clienteMembro: false } : l,
    );
    expect(modulosDesligados('CLIENT', linhas)).toContain('tickets');
    expect(modulosDesligados('OUTRO', linhas)).toHaveLength(
      MODULOS_PORTAL.length,
    );
  });
});

describe('problemaNaLinha', () => {
  it('recusa chave desconhecida (inclusive Administração)', () => {
    expect(problemaNaLinha(linha('administracao'))).toMatch(/desconhecido/);
  });

  it('recusa liberar para perfil que o módulo não aceita', () => {
    expect(
      problemaNaLinha(
        linha('agendas', {
          terceiro: false,
          clienteGestor: true,
          clienteMembro: false,
        }),
      ),
    ).toMatch(/não pode/);
  });

  it('aceita linha válida', () => {
    expect(
      problemaNaLinha(
        linha('agendas', {
          terceiro: false,
          clienteGestor: false,
          clienteMembro: false,
        }),
      ),
    ).toBeNull();
  });
});
