import { apiRequest } from "@/lib/api";

export type CargaPessoa = {
  userId: string;
  nome: string;
  papel: string;
  mesa: string;
  abertos: number;
  parados: number;
  chamadosParados: Array<{
    ticketNumber: number;
    titulo: string | null;
    dias: number;
  }>;
  minutosSemana: number;
  jornadaSemana: number;
  esperadoAteHoje: number;
  percentual: number | null;
};

export type CargaMesa = {
  mesa: string;
  pessoas: number;
  abertos: number;
  parados: number;
  semResponsavel: number;
  minutosSemana: number;
  esperadoAteHoje: number;
};

export type Carga = {
  semana: { inicio: string; fim: string; diasUteisAteHoje: number };
  geradoEm: string;
  totais: { abertos: number; parados: number; semResponsavel: number };
  pessoas: CargaPessoa[];
  mesas: CargaMesa[];
};

export const cargaService = {
  carga() {
    return apiRequest<Carga>("/carga-equipe");
  },
};
