import { apiRequest } from "@/lib/api";

export type TurnoPlantao = {
  /** Texto do compromisso no Outlook, como está escrito lá. */
  titulo: string;
  /** Data local sem fuso — o servidor já pediu no horário de Brasília. */
  inicio: string;
  fim: string;
  agora: boolean;
};

export type EscalaPlantao = {
  rotulo: string;
  turnos: TurnoPlantao[];
  /** Preenchido quando a leitura falhou; a tela diz, não esconde. */
  erro: string | null;
};

export type PlantaoResposta = {
  /** false quando falta PLANTAO_CALENDARIOS no servidor. */
  configurado: boolean;
  atualizadoEm: string;
  escalas: EscalaPlantao[];
};

export const plantaoService = {
  escalas(dias?: number) {
    const qs = dias ? `?dias=${dias}` : "";
    return apiRequest<PlantaoResposta>(`/plantao/escalas${qs}`);
  },
};
