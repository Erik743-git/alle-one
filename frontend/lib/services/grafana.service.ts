import { apiRequest } from "@/lib/api";

export type GrafanaBoard = {
  id: string;
  title: string;
  /** Endereço do painel publicado, aberto dentro do quadro. */
  url: string;
};

export type GrafanaBoardsResponse = {
  /** false quando falta o endereço do Grafana na configuração do servidor. */
  configured: boolean;
  /** true quando os painéis são os de demonstração, não os da empresa. */
  demo: boolean;
  orgName: string | null;
  boards: GrafanaBoard[];
};

export const grafanaService = {
  listBoards() {
    return apiRequest<GrafanaBoardsResponse>("/grafana/boards");
  },
};
