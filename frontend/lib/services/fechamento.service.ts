import { apiRequest } from "@/lib/api";

export type CicloResumo = {
  ciclo: string;
  inicio: string;
  fim: string;
  encerrado: boolean;
  fechado: boolean;
  ultimoEvento: {
    acao: "FECHOU" | "REABRIU";
    em: string;
    por: string;
    motivo: string | null;
  } | null;
};

export type TipoAchado =
  | "SOBREPOSICAO"
  | "DIA_LONGO"
  | "FIM_DE_SEMANA"
  | "LANCADO_DEPOIS";

export type Conferencia = {
  ciclo: string;
  inicio: string;
  fim: string;
  apontamentos: number;
  pessoas: number;
  resumo: Record<TipoAchado, number>;
  achados: Array<{
    tipo: TipoAchado;
    userId: string;
    nome: string;
    data: string;
    detalhe: string;
    chamados: number[];
    apontamentos: string[];
  }>;
  historico: Array<{
    acao: "FECHOU" | "REABRIU";
    motivo: string | null;
    pendencias: number | null;
    em: string;
    por: string;
  }>;
};

export const fechamentoService = {
  listar() {
    return apiRequest<CicloResumo[]>("/fechamento");
  },
  conferencia(ciclo: string) {
    return apiRequest<Conferencia>(`/fechamento/${ciclo}`);
  },
  fechar(ciclo: string) {
    return apiRequest<Conferencia>(`/fechamento/${ciclo}/fechar`, {
      method: "POST",
    });
  },
  reabrir(ciclo: string, motivo: string) {
    return apiRequest<Conferencia>(`/fechamento/${ciclo}/reabrir`, {
      method: "POST",
      body: { motivo },
    });
  },
};
