/**
 * Módulos que a tela Administração → Acesso por perfil liga e desliga.
 *
 * Administração não está aqui de propósito: é sempre só admin e não pode ser
 * desligada nem liberada por engano (decisão de 25/09).
 * Desenho: docs/desenho/ACESSO-POR-PERFIL.md.
 */
export type PerfilAcesso =
  | 'COLLABORATOR'
  | 'PJ'
  | 'CLIENT_GESTOR'
  | 'CLIENT_MEMBER';

export const PERFIS_ACESSO: PerfilAcesso[] = [
  'COLLABORATOR',
  'PJ',
  'CLIENT_GESTOR',
  'CLIENT_MEMBER',
];

export type ModuloPortal = {
  chave: string;
  nome: string;
  /**
   * Perfis que podem receber o módulo. Os outros ficam travados na tela:
   * Relatórios não tem recorte para o terceiro (veria todas as empresas).
   */
  perfisPossiveis: PerfilAcesso[];
};

const TODOS = PERFIS_ACESSO;
/**
 * Pré-tickets, Agendas, Mural e Oportunidades foram feitos para a equipe
 * CLT: a caixa de pré-tickets não tem recorte por mesa, e escala/mural listam
 * só colaboradores. Liberar para o terceiro pede ajuste nessas telas antes.
 */
const SO_CLT: PerfilAcesso[] = ['COLLABORATOR'];

export const MODULOS_PORTAL: ModuloPortal[] = [
  { chave: 'dashboard', nome: 'Dashboard', perfisPossiveis: TODOS },
  { chave: 'tickets', nome: 'Tickets', perfisPossiveis: TODOS },
  {
    chave: 'pre-tickets',
    nome: 'Pré-tickets (e-mails)',
    perfisPossiveis: SO_CLT,
  },
  {
    chave: 'monitoramento',
    nome: 'Console e Monitoramento',
    perfisPossiveis: TODOS,
  },
  {
    chave: 'agendas',
    nome: 'Agendas (Plantão, Escala, Manutenção)',
    perfisPossiveis: SO_CLT,
  },
  { chave: 'mural', nome: 'Mural', perfisPossiveis: SO_CLT },
  {
    chave: 'oportunidades',
    nome: 'Oportunidades',
    perfisPossiveis: ['COLLABORATOR'],
  },
  { chave: 'financeiro', nome: 'Financeiro', perfisPossiveis: TODOS },
  { chave: 'gmud', nome: 'GMUD', perfisPossiveis: TODOS },
  {
    chave: 'relatorios',
    nome: 'Relatórios',
    // Cliente fica de fora até as rotas de relatório passarem por uma revisão
    // de recorte (lista de técnicos, cobrança por várias empresas).
    perfisPossiveis: ['COLLABORATOR'],
  },
  { chave: 'apontamentos', nome: 'Apontamentos', perfisPossiveis: TODOS },
  {
    // Aba de Apontamentos com a carga de todos os técnicos: só equipe CLT.
    chave: 'carga-equipe',
    nome: 'Apontamentos — Carga da equipe',
    perfisPossiveis: SO_CLT,
  },
  {
    chave: 'apontamentos-horas',
    nome: 'Apontamentos — bloco de horas do mês',
    perfisPossiveis: TODOS,
  },
  { chave: 'inventario', nome: 'Inventário', perfisPossiveis: TODOS },
  { chave: 'projetos', nome: 'Projetos', perfisPossiveis: TODOS },
  { chave: 'aplicativos', nome: 'Aplicativos', perfisPossiveis: TODOS },
];

export const CHAVES_MODULOS = new Set(MODULOS_PORTAL.map((m) => m.chave));
