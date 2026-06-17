import { apiRequest } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import { API_URL } from "@/lib/env";

export type Company = {
  id: string;
  name: string;
  responsibleName: string;
  email: string;
  cnpj?: string | null;
  address?: string | null;
  status: boolean;
  tifluxClientId?: number | null;
  tifluxClientName?: string | null;
  zabbixGroupName?: string | null;
  logoFileId: string | null;
  contractsCount?: number;
  documentsCount?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type CreateCompanyPayload = {
  name: string;
  responsibleName: string;
  email: string;
  cnpj?: string;
  address?: string;
  zabbixGroupName?: string;
  tifluxClientId?: number;
  tifluxClientName?: string;
  status?: boolean;
};

export type UpdateCompanyPayload = {
  name?: string;
  responsibleName?: string;
  email?: string;
  cnpj?: string;
  address?: string;
  zabbixGroupName?: string;
  tifluxClientId?: number;
  tifluxClientName?: string;
  status?: boolean;
};

export const companiesService = {
  async list() {
    return apiRequest<Company[]>("/companies");
  },

  /** Empresas acessíveis para troca no dashboard (equipe interna). */
  async listAccessible() {
    return apiRequest<Company[]>("/companies/session/accessible");
  },

  async getById(id: string) {
    return apiRequest<Company>(`/companies/${id}`);
  },

  /** Empresa do usuário logado (não exige módulo Empresas / perfil admin). */
  async getSessionCompany() {
    return apiRequest<Company>("/companies/session/mine");
  },

  async create(payload: CreateCompanyPayload) {
    return apiRequest<Company>("/companies", {
      method: "POST",
      body: payload,
    });
  },

  async update(id: string, payload: UpdateCompanyPayload) {
    return apiRequest<Company>(`/companies/${id}`, {
      method: "PATCH",
      body: payload,
    });
  },

  async remove(id: string) {
    return apiRequest<Company>(`/companies/${id}`, {
      method: "DELETE",
    });
  },

  async uploadLogo(companyId: string, file: File) {
    const form = new FormData();
    form.set("file", file);
    return apiRequest<{ companyId: string; logoFileId: string; file: { id: string; originalName: string } }>(
      `/companies/${companyId}/logo`,
      {
        method: "POST",
        body: form,
      }
    );
  },

  async getLogoBlob(companyId: string) {
    const res = await authFetch(`${API_URL}/companies/${companyId}/logo`, {
      method: "GET",
    });
    if (!res.ok) {
      throw new Error(`Erro ao carregar logo (${res.status}).`);
    }
    const blob = await res.blob();
    return blob;
  },

  async removeLogo(companyId: string) {
    return apiRequest<{ companyId: string; logoFileId: null }>(`/companies/${companyId}/logo`, {
      method: "DELETE",
    });
  },

  async listZabbixGroups() {
    return apiRequest<Array<{ groupid: string; name: string }>>(
      "/companies/zabbix-groups",
    );
  },

  async validateZabbixGroup(name: string) {
    const qs = new URLSearchParams({ name });
    return apiRequest<{
      input: string;
      exists: boolean;
      canonicalName: string | null;
      groupid: string | null;
    }>(`/companies/zabbix-groups/validate?${qs.toString()}`);
  },

  async suggestZabbixGroups(params?: { minScore?: number; onlyInvalid?: boolean }) {
    const qs = new URLSearchParams();
    if (params?.minScore != null) {
      qs.set("minScore", String(params.minScore));
    }
    if (params?.onlyInvalid != null) {
      qs.set("onlyInvalid", String(params.onlyInvalid));
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return apiRequest<{
      groupsAvailable: number;
      suggestions: Array<{
        companyId: string;
        companyName: string;
        currentGroup: string | null;
        suggestedGroup: string;
        suggestedGroupId: string;
        score: number;
        reason: string;
      }>;
    }>(`/companies/zabbix-groups/suggest${suffix}`);
  },

  async applyZabbixGroupSuggestions(
    items: Array<{ companyId: string; zabbixGroupName: string }>,
  ) {
    return apiRequest<{
      total: number;
      applied: number;
      results: Array<{
        companyId: string;
        companyName: string;
        zabbixGroupName: string;
        applied: boolean;
        message?: string;
      }>;
    }>("/companies/zabbix-groups/apply", {
      method: "POST",
      body: { items },
    });
  },
};