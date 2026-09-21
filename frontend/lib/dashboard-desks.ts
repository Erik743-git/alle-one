import type { DashboardMesRow } from "@/lib/services/dashboard.service";

/** Campos que a linha usa para si; o resto das chaves são mesas. */
const CAMPOS_RESERVADOS = new Set(["monthKey", "monthLabel", "Total"]);

/**
 * Quantas mesas aparecem quando a pessoa nunca editou o gráfico.
 * Todas de uma vez polui demais — são 9 mesas hoje.
 */
export const MESAS_PADRAO_NO_GRAFICO = 5;

/** Mesas presentes nas linhas, da que mais soma para a que menos. */
export function deskNamesFromRows(rows: DashboardMesRow[]): string[] {
  const totais = new Map<string, number>();
  for (const row of rows) {
    for (const [chave, valor] of Object.entries(row)) {
      if (CAMPOS_RESERVADOS.has(chave) || typeof valor !== "number") continue;
      totais.set(chave, (totais.get(chave) ?? 0) + valor);
    }
  }
  return Array.from(totais.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .map(([mesa]) => mesa);
}

/**
 * Mesas que o gráfico desenha.
 *
 * Sem escolha salva, mostra as mais movimentadas do período — assim o
 * gráfico já nasce legível e mesa nova aparece sozinha quando cresce.
 * Com escolha salva, respeita exatamente o que a pessoa marcou, na ordem
 * de movimento, e ignora mesa que sumiu do período (senão a série fica
 * pendurada vazia depois de trocar o filtro de datas).
 */
export function resolveVisibleDesks(
  rows: DashboardMesRow[],
  escolhidas: string[] | undefined,
): string[] {
  const disponiveis = deskNamesFromRows(rows);
  if (!escolhidas?.length) {
    return disponiveis.slice(0, MESAS_PADRAO_NO_GRAFICO);
  }
  const marcadas = new Set(escolhidas);
  const visiveis = disponiveis.filter((mesa) => marcadas.has(mesa));
  // Se nenhuma das mesas escolhidas teve movimento no período, cair no
  // padrão é melhor do que mostrar um gráfico vazio sem explicação.
  return visiveis.length > 0
    ? visiveis
    : disponiveis.slice(0, MESAS_PADRAO_NO_GRAFICO);
}

/** Valor numérico da mesa na linha (0 quando o mês não teve movimento). */
export function deskValue(row: DashboardMesRow, deskName: string): number {
  const valor = row[deskName];
  return typeof valor === "number" ? valor : 0;
}
