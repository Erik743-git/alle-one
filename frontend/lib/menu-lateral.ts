/**
 * Personalizar menu: ordem e itens escondidos de cada pessoa, aplicados sobre
 * o que ela já tem acesso. É só preferência de tela — quem bloqueia de
 * verdade é Acesso por perfil (menu + API).
 */
export type PreferenciaMenu = {
  ordem: string[];
  visivel: Record<string, boolean>;
};

/** Item do menu → módulo de Acesso por perfil (para saber se está em construção). */
export const MODULO_DO_ITEM: Record<string, string> = {
  dashboard: "dashboard",
  tickets: "tickets",
  console: "monitoramento",
  agendas: "agendas",
  monitoramento: "monitoramento",
  mural: "mural",
  oportunidades: "oportunidades",
  financeiro: "financeiro",
  gmud: "gmud",
  relatorios: "relatorios",
  apontamentos: "apontamentos",
  inventario: "inventario",
  projetos: "projetos",
  aplicativos: "aplicativos",
};

export function itemEmConstrucao(
  chave: string,
  emConstrucao: string[],
): boolean {
  const modulo = MODULO_DO_ITEM[chave];
  return !!modulo && emConstrucao.includes(modulo);
}

export type ItemPersonalizado<T> = T & {
  visivel: boolean;
  emConstrucao: boolean;
};

/**
 * Aplica a preferência. `itens` já vem filtrado pelo acesso e na ordem padrão.
 * - Ordem: a escolhida primeiro; item que não estava nela (módulo liberado
 *   depois) entra no fim, na ordem padrão.
 * - Visível: a escolha da pessoa; sem escolha, módulo em construção começa
 *   escondido (só o admin chega a ter esse item) e o resto aparece.
 */
export function aplicarPreferenciaMenu<T extends { chave: string }>(
  itens: T[],
  preferencia: PreferenciaMenu | null | undefined,
  emConstrucao: string[] = [],
): ItemPersonalizado<T>[] {
  const ordem = preferencia?.ordem ?? [];
  const porChave = new Map(itens.map((i) => [i.chave, i]));
  const ordenados: T[] = [];
  for (const chave of ordem) {
    const item = porChave.get(chave);
    if (item && !ordenados.includes(item)) ordenados.push(item);
  }
  for (const item of itens) if (!ordenados.includes(item)) ordenados.push(item);
  return ordenados.map((item) => {
    const obra = itemEmConstrucao(item.chave, emConstrucao);
    const escolha = preferencia?.visivel?.[item.chave];
    return { ...item, emConstrucao: obra, visivel: escolha ?? !obra };
  });
}
