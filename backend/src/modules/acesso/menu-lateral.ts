/**
 * Itens do menu lateral que a pessoa pode esconder e reordenar
 * (Personalizar menu). "Novo ticket" não é módulo e Administração é fixa
 * para o admin: nenhum dos dois entra aqui.
 *
 * `modulo` liga o item à chave de Acesso por perfil (modulos-portal.ts):
 * item de módulo em construção começa escondido até para o admin.
 */
export const MENU_LATERAL: Array<{ chave: string; modulo: string }> = [
  { chave: 'dashboard', modulo: 'dashboard' },
  { chave: 'tickets', modulo: 'tickets' },
  { chave: 'console', modulo: 'monitoramento' },
  { chave: 'agendas', modulo: 'agendas' },
  { chave: 'monitoramento', modulo: 'monitoramento' },
  { chave: 'mural', modulo: 'mural' },
  { chave: 'oportunidades', modulo: 'oportunidades' },
  { chave: 'financeiro', modulo: 'financeiro' },
  { chave: 'gmud', modulo: 'gmud' },
  { chave: 'relatorios', modulo: 'relatorios' },
  { chave: 'apontamentos', modulo: 'apontamentos' },
  { chave: 'inventario', modulo: 'inventario' },
  { chave: 'projetos', modulo: 'projetos' },
  { chave: 'aplicativos', modulo: 'aplicativos' },
];

export const CHAVES_MENU = new Set(MENU_LATERAL.map((m) => m.chave));

export type PreferenciaMenuDados = {
  ordem: string[];
  visivel: Record<string, boolean>;
};

/**
 * Limpa o que veio da tela: só chaves conhecidas, sem repetir, booleanos de
 * verdade. Chave desconhecida é descartada (item removido do portal).
 */
export function normalizarPreferencia(entrada: unknown): PreferenciaMenuDados {
  const e = (entrada ?? {}) as { ordem?: unknown; visivel?: unknown };
  const ordem: string[] = [];
  if (Array.isArray(e.ordem)) {
    for (const c of e.ordem) {
      if (typeof c === 'string' && CHAVES_MENU.has(c) && !ordem.includes(c)) {
        ordem.push(c);
      }
    }
  }
  const visivel: Record<string, boolean> = {};
  if (e.visivel && typeof e.visivel === 'object' && !Array.isArray(e.visivel)) {
    for (const [c, v] of Object.entries(e.visivel as Record<string, unknown>)) {
      if (CHAVES_MENU.has(c) && typeof v === 'boolean') visivel[c] = v;
    }
  }
  return { ordem, visivel };
}
