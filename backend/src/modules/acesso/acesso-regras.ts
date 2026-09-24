import type { AcessoModulo } from '@prisma/client';

import {
  CHAVES_MODULOS,
  MODULOS_PORTAL,
  type PerfilAcesso,
} from './modulos-portal';

export type LinhaAcesso = Pick<
  AcessoModulo,
  | 'chave'
  | 'emConstrucao'
  | 'colaborador'
  | 'terceiro'
  | 'clienteGestor'
  | 'clienteMembro'
>;

/** Papel do usuário → coluna da tabela. ADMIN não tem coluna (vê tudo). */
export function perfilDoPapel(role: string): PerfilAcesso | null {
  switch (role) {
    case 'COLLABORATOR':
      return 'COLLABORATOR';
    case 'PJ':
      return 'PJ';
    case 'CLIENT_GESTOR':
      return 'CLIENT_GESTOR';
    // CLIENT é o papel antigo do portal cliente: fica com o mais restrito.
    case 'CLIENT':
    case 'CLIENT_MEMBER':
      return 'CLIENT_MEMBER';
    default:
      return null;
  }
}

function coluna(linha: LinhaAcesso, perfil: PerfilAcesso): boolean {
  switch (perfil) {
    case 'COLLABORATOR':
      return linha.colaborador;
    case 'PJ':
      return linha.terceiro;
    case 'CLIENT_GESTOR':
      return linha.clienteGestor;
    case 'CLIENT_MEMBER':
      return linha.clienteMembro;
  }
}

/**
 * Chaves desligadas para o papel. Módulo sem linha no banco conta como
 * desligado (falha fechada): um módulo novo no catálogo só aparece depois
 * que o admin liga.
 */
export function modulosDesligados(
  role: string,
  linhas: LinhaAcesso[],
): string[] {
  if (role === 'ADMIN') return [];
  const perfil = perfilDoPapel(role);
  const porChave = new Map(linhas.map((l) => [l.chave, l]));
  const fora: string[] = [];
  for (const modulo of MODULOS_PORTAL) {
    const linha = porChave.get(modulo.chave);
    const liberado =
      !!perfil &&
      !!linha &&
      !linha.emConstrucao &&
      modulo.perfisPossiveis.includes(perfil) &&
      coluna(linha, perfil);
    if (!liberado) fora.push(modulo.chave);
  }
  return fora;
}

/** Recusa chave fora do catálogo e perfil que o módulo não aceita. */
export function problemaNaLinha(linha: LinhaAcesso): string | null {
  if (!CHAVES_MODULOS.has(linha.chave)) return 'Módulo desconhecido.';
  const modulo = MODULOS_PORTAL.find((m) => m.chave === linha.chave)!;
  const marcados: Array<[PerfilAcesso, boolean]> = [
    ['COLLABORATOR', linha.colaborador],
    ['PJ', linha.terceiro],
    ['CLIENT_GESTOR', linha.clienteGestor],
    ['CLIENT_MEMBER', linha.clienteMembro],
  ];
  for (const [perfil, ligado] of marcados) {
    if (ligado && !modulo.perfisPossiveis.includes(perfil)) {
      return `${modulo.nome} não pode ser liberado para esse perfil.`;
    }
  }
  return null;
}
