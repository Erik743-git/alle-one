import { apiRequest } from "@/lib/api";

/** Cliente legado (ID numérico histórico) — lido do cadastro de empresas do portal, sem API TiFlux. */
export type TifluxClient = {
  id: number;
  name?: string;
  social_name?: string;
  active?: boolean;
};

export function getTifluxClients(params?: {
  active?: boolean;
  name?: string;
}) {
  const search = new URLSearchParams();
  search.set("all", "1");

  if (params?.active !== undefined) {
    search.set("active", params.active ? "true" : "false");
  }

  if (params?.name) {
    search.set("name", params.name);
  }

  const suffix = search.toString() ? `?${search.toString()}` : "";
  return apiRequest<TifluxClient[]>(`/tiflux/clients${suffix}`);
}
