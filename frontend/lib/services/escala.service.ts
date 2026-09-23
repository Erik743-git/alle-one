import { apiRequest } from "@/lib/api";

export type TurnoEscala = {
  regraId: string;
  /** Preenchido quando o pedaço veio de uma troca. */
  excecaoId: string | null;
  userId: string;
  userName: string;
  specialtyName: string;
  /** Minutos a partir da meia-noite do dia pedido; pode ser negativo (véspera). */
  inicio: number;
  fim: number;
  /** Dia em que o turno começou — é nele que se registra a troca. */
  diaDoTurno: string;
  /** FOLGA = pedaço vago: aparece, mas ninguém responde por ele. */
  origem: "REGRA" | "TROCA" | "FOLGA";
  substituiu: string | null;
  motivo: string | null;
};

export type RegraEscala = {
  id: string;
  userId: string;
  userName: string;
  specialtyId: string;
  specialtyName: string;
  startTime: string;
  endTime: string;
  /** 0 = domingo ... 6 = sábado. */
  daysOfWeek: number[];
  validFrom: string;
  validTo: string | null;
};

export type RegraEscalaInput = Omit<
  RegraEscala,
  "id" | "userName" | "specialtyName"
>;

export type ExcecaoEscalaInput = {
  regraId: string;
  date: string;
  tipo: "FOLGA" | "TROCA";
  substituteUserId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  motivo?: string | null;
};

export type OpcoesEscala = {
  pessoas: Array<{ id: string; name: string }>;
  especialidades: Array<{ id: string; name: string }>;
};

export const escalaService = {
  dia(data: string) {
    return apiRequest<{ data: string; turnos: TurnoEscala[] }>(
      `/agendas/escala/dia?data=${data}`,
    );
  },
  opcoes() {
    return apiRequest<OpcoesEscala>("/agendas/escala/opcoes");
  },
  regras() {
    return apiRequest<RegraEscala[]>("/agendas/escala/regras");
  },
  criarRegra(data: RegraEscalaInput) {
    return apiRequest<{ id: string }>("/agendas/escala/regras", {
      method: "POST",
      body: data,
    });
  },
  atualizarRegra(id: string, data: RegraEscalaInput) {
    return apiRequest<{ ok: true }>(`/agendas/escala/regras/${id}`, {
      method: "PATCH",
      body: data,
    });
  },
  removerRegra(id: string) {
    return apiRequest<{ ok: true }>(`/agendas/escala/regras/${id}`, {
      method: "DELETE",
    });
  },
  registrarExcecao(data: ExcecaoEscalaInput) {
    return apiRequest<{ ok: true }>("/agendas/escala/excecoes", {
      method: "POST",
      body: data,
    });
  },
  removerExcecao(regraId: string, date: string) {
    return apiRequest<{ ok: true }>(
      `/agendas/escala/excecoes/${regraId}/${date}`,
      { method: "DELETE" },
    );
  },
};
