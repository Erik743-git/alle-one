import { apiRequest } from "@/lib/api";

/** Janela combinada com o cliente. Horários no fuso de Brasília. */
export type JanelaManutencao = {
  id: string;
  companyId: string;
  companyName: string;
  /** true = repete toda semana; false = avulsa, com início e fim. */
  recorrente: boolean;
  /** 0 = domingo ... 6 = sábado. */
  daysOfWeek: number[];
  startTime: string | null;
  endTime: string | null;
  validFrom: string | null;
  validTo: string | null;
  /** Avulsa: instantes ISO. */
  inicio: string | null;
  fim: string | null;
  /** De quem é a alteração feita na janela. */
  responsavel: "ALLE" | "CLIENTE";
  observacoes: string | null;
};

export type JanelaManutencaoInput = Omit<
  JanelaManutencao,
  "id" | "companyName"
>;

export type OcorrenciaJanela = {
  janelaId: string;
  companyId: string;
  companyName: string;
  responsavel: "ALLE" | "CLIENTE";
  observacoes: string | null;
  inicio: string;
  fim: string;
};

/**
 * DENTRO: cabe numa janela. FORA: algum pedaço fica fora (só aviso, não
 * bloqueia). SEM_JANELA: a empresa não tem janela cadastrada.
 */
export type SituacaoGmud = "DENTRO" | "FORA" | "SEM_JANELA";

export type GmudNoCalendario = {
  id: string;
  code: number;
  title: string;
  status: string;
  companyId: string;
  companyName: string;
  trechos: Array<{
    inicio: string;
    fim: string;
    tipo: "ATIVIDADE" | "INDISPONIBILIDADE";
  }>;
  situacao: SituacaoGmud;
  fora: Array<{ inicio: string; fim: string }>;
};

export type CalendarioManutencao = {
  de: string;
  ate: string;
  janelas: OcorrenciaJanela[];
  gmuds: GmudNoCalendario[];
};

export const manutencaoService = {
  calendario(de: string, ate: string, companyId?: string) {
    const params = new URLSearchParams({ de, ate });
    if (companyId) params.set("companyId", companyId);
    return apiRequest<CalendarioManutencao>(
      `/agendas/manutencao/calendario?${params.toString()}`,
    );
  },

  janelas(companyId?: string) {
    const query = companyId
      ? `?companyId=${encodeURIComponent(companyId)}`
      : "";
    return apiRequest<JanelaManutencao[]>(
      `/agendas/manutencao/janelas${query}`,
    );
  },

  criarJanela(dados: JanelaManutencaoInput) {
    return apiRequest<JanelaManutencao>("/agendas/manutencao/janelas", {
      method: "POST",
      body: dados,
    });
  },

  atualizarJanela(id: string, dados: JanelaManutencaoInput) {
    return apiRequest<JanelaManutencao>(`/agendas/manutencao/janelas/${id}`, {
      method: "PATCH",
      body: dados,
    });
  },

  removerJanela(id: string) {
    return apiRequest<{ ok: true }>(`/agendas/manutencao/janelas/${id}`, {
      method: "DELETE",
    });
  },
};
