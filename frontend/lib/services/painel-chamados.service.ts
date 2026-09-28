import { apiRequest } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import { readBlobDownload, triggerBrowserDownload } from "@/lib/download-blob";
import { API_URL } from "@/lib/env";
import type {
  ChamadoDoGrupo,
  ChamadoParado,
  GrupoResumo,
  Visao,
} from "@/lib/painel-chamados";

function query(params: Record<string, string | boolean | null | undefined>) {
  const qs = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === null || valor === "" || valor === false) {
      continue;
    }
    qs.set(chave, String(valor));
  }
  const texto = qs.toString();
  return texto ? `?${texto}` : "";
}

async function baixar(caminho: string, nomePadrao: string) {
  const res = await authFetch(`${API_URL}${caminho}`, { method: "GET" });
  if (res.status === 401) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  if (!res.ok) {
    throw new Error(`Não foi possível gerar a planilha (${res.status}).`);
  }
  const { blob, filename } = await readBlobDownload(res, nomePadrao);
  triggerBrowserDownload(blob, filename);
}

/** Abas de admin em Apontamentos. A API recusa quem não é admin. */
export const painelChamadosService = {
  parados() {
    return apiRequest<{
      linhas: ChamadoParado[];
      totais: { total: number; mais48h: number; semResponsavel: number };
    }>("/painel-chamados/parados");
  },

  exportarParados(filtro: {
    empresa: string;
    responsavel: string;
    so48h: boolean;
  }) {
    return baixar(
      `/painel-chamados/parados.xlsx${query(filtro)}`,
      "chamados-parados.xlsx",
    );
  },

  resumo(visao: Visao, incluirFechados: boolean) {
    return apiRequest<{
      grupos: GrupoResumo[];
      totais: { abertos: number; parados48h: number; fechadosNoMes: number };
    }>(`/painel-chamados/responsaveis${query({ visao, incluirFechados })}`);
  },

  chamados(visao: Visao, chave: string, incluirFechados: boolean) {
    return apiRequest<ChamadoDoGrupo[]>(
      `/painel-chamados/responsaveis/chamados${query({ visao, chave, incluirFechados })}`,
    );
  },

  exportarChamados(visao: Visao, chave: string | null, incluirFechados: boolean) {
    return baixar(
      `/painel-chamados/responsaveis.xlsx${query({ visao, chave, incluirFechados })}`,
      "chamados-por-responsavel.xlsx",
    );
  },
};
