/**
 * Abas de admin em Apontamentos: "Chamados parados" e "Chamados por
 * responsável". Agrupar, filtrar e somar ficam aqui, sem tela, para testar.
 * A API aplica o mesmo filtro no Excel (painel-chamados-regras.ts).
 */

export type Visao = "empresa" | "responsavel";

export type ChamadoParado = {
  ticketNumber: number;
  titulo: string | null;
  empresaChave: string;
  empresa: string;
  responsavelChave: string;
  responsavel: string;
  abertoEm: string;
  horasParado: number;
  mais48h: boolean;
  semResponsavel: boolean;
};

export type FiltroParados = {
  empresa: string;
  responsavel: string;
  so48h: boolean;
};

export type GrupoParados = {
  chave: string;
  nome: string;
  linhas: ChamadoParado[];
  mais48h: number;
};

export type GrupoResumo = {
  chave: string;
  nome: string;
  abertos: number;
  parados48h: number;
  fechadosNoMes: number;
};

export type ChamadoDoGrupo = {
  ticketNumber: number;
  titulo: string | null;
  empresa: string;
  responsavel: string;
  estagio: string | null;
  fechado: boolean;
  abertoEm: string;
  ultimaAtividade: string;
};

export function filtrarParados(
  linhas: ChamadoParado[],
  filtro: FiltroParados,
): ChamadoParado[] {
  return linhas.filter(
    (l) =>
      (!filtro.empresa || l.empresaChave === filtro.empresa) &&
      (!filtro.responsavel || l.responsavelChave === filtro.responsavel) &&
      (!filtro.so48h || l.mais48h),
  );
}

export function totaisParados(linhas: ChamadoParado[]) {
  return {
    total: linhas.length,
    mais48h: linhas.filter((l) => l.mais48h).length,
    semResponsavel: linhas.filter((l) => l.semResponsavel).length,
  };
}

/**
 * Agrupa mantendo a ordem da lista (do mais antigo para o mais novo): o grupo
 * que tem o chamado parado há mais tempo aparece primeiro.
 */
export function agruparParados(
  linhas: ChamadoParado[],
  visao: Visao,
): GrupoParados[] {
  const grupos = new Map<string, GrupoParados>();
  for (const l of linhas) {
    const chave = visao === "empresa" ? l.empresaChave : l.responsavelChave;
    const nome = visao === "empresa" ? l.empresa : l.responsavel;
    const g = grupos.get(chave) ?? { chave, nome, linhas: [], mais48h: 0 };
    g.linhas.push(l);
    if (l.mais48h) g.mais48h += 1;
    grupos.set(chave, g);
  }
  return [...grupos.values()];
}

/** Opções do filtro: cada empresa/responsável uma vez, em ordem alfabética. */
export function opcoesFiltro(
  linhas: ChamadoParado[],
  visao: Visao,
): Array<{ value: string; label: string }> {
  const vistos = new Map<string, { nome: string; qtd: number }>();
  for (const l of linhas) {
    const chave = visao === "empresa" ? l.empresaChave : l.responsavelChave;
    const nome = visao === "empresa" ? l.empresa : l.responsavel;
    const atual = vistos.get(chave);
    vistos.set(chave, { nome, qtd: (atual?.qtd ?? 0) + 1 });
  }
  return [...vistos.entries()]
    .sort((a, b) => a[1].nome.localeCompare(b[1].nome, "pt-BR"))
    .map(([value, v]) => ({ value, label: `${v.nome} (${v.qtd})` }));
}

/** "52h (2 dias)": a conta é em horas corridas; os dias ajudam a ler. */
export function formatarTempoParado(horas: number): string {
  if (horas < 48) return `${horas}h`;
  const dias = Math.floor(horas / 24);
  return `${horas}h (${dias} dias)`;
}
