import { apiRequest } from "@/lib/api";

export type PopupSatisfacao =
  | { tipo: "NPS"; token: string; empresa: string }
  | {
      tipo: "AVALIACAO";
      token: string;
      ticketNumber: number;
      titulo: string | null;
      responsavel: string | null;
    };

export type ConfigNpsEmpresa = {
  companyId: string;
  ativo: boolean;
  intervaloMeses: number;
  destinatarios: string[];
  pessoas: Array<{ id: string; nome: string; email: string; papel: string }>;
};

type Conta = {
  nps: number | null;
  respostas: number;
  promotores: number;
  neutros: number;
  detratores: number;
};

export type PainelNps = {
  enviadas: number;
  global: Conta;
  porTrimestre: Array<Conta & { trimestre: string }>;
  porEmpresa: Array<Conta & { companyId: string; nome: string }>;
  comentarios: Array<{
    nota: number;
    classe: "PROMOTOR" | "NEUTRO" | "DETRATOR";
    comentario: string;
    nome: string;
    empresa: string;
    respondidaEm: string;
  }>;
};

export const npsService = {
  popup() {
    return apiRequest<{ popup: PopupSatisfacao | null }>("/popup-satisfacao");
  },
  dispensar(tipo: PopupSatisfacao["tipo"], token: string) {
    return apiRequest<{ ok: boolean }>("/popup-satisfacao/dispensar", {
      method: "POST",
      body: { tipo, token },
    });
  },
  /** Resposta pelo pop-up usa o mesmo endpoint do link do e-mail (token). */
  responderNps(token: string, nota: number, comentario: string) {
    return apiRequest<{ ok: true }>(`/nps/${encodeURIComponent(token)}`, {
      method: "POST",
      body: { nota, comentario, canal: "PORTAL" },
    });
  },
  responderAvaliacao(token: string, rating: number, comment: string) {
    return apiRequest<{ ok: true }>(
      `/satisfacao/${encodeURIComponent(token)}`,
      { method: "POST", body: { rating, comment, channel: "PORTAL" } },
    );
  },
  config(companyId: string) {
    return apiRequest<ConfigNpsEmpresa>(`/admin/nps/empresas/${companyId}`);
  },
  salvarConfig(
    companyId: string,
    dados: { ativo: boolean; intervaloMeses: number; destinatarios: string[] },
  ) {
    return apiRequest<ConfigNpsEmpresa>(`/admin/nps/empresas/${companyId}`, {
      method: "PUT",
      body: dados,
    });
  },
  painel(de?: string, ate?: string) {
    const p = new URLSearchParams();
    if (de) p.set("de", de);
    if (ate) p.set("ate", ate);
    const q = p.toString();
    return apiRequest<PainelNps>(`/admin/nps/painel${q ? `?${q}` : ""}`);
  },
};
