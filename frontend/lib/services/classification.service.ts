import { apiRequest } from "@/lib/api";

export type ServiceDeskOption = {
  id: string;
  name: string;
  externalId: number | null;
  source: "tiflux" | "portal";
};

export type ClassificationNode = {
  id: string;
  name: string;
  level: number;
  active: boolean;
  sortOrder: number;
  parentId: string | null;
  children: ClassificationNode[];
};

export type ClassificationTreeResponse = {
  desk: ServiceDeskOption;
  levelLabels: Array<{ level: number; label: string }>;
  tree: ClassificationNode[];
};

export const classificationService = {
  async listDesks() {
    return apiRequest<ServiceDeskOption[]>("/admin/classifications/desks");
  },

  async createDesk(name: string) {
    return apiRequest<ServiceDeskOption>("/admin/classifications/desks", {
      method: "POST",
      body: { name },
    });
  },

  async updateDesk(id: string, name: string) {
    return apiRequest<ServiceDeskOption>(`/admin/classifications/desks/${id}`, {
      method: "PATCH",
      body: { name },
    });
  },

  async deleteDesk(id: string) {
    return apiRequest(`/admin/classifications/desks/${id}`, {
      method: "DELETE",
    });
  },

  async getTree(serviceDeskId: string) {
    return apiRequest<ClassificationTreeResponse>(
      `/admin/classifications?serviceDeskId=${encodeURIComponent(serviceDeskId)}`,
    );
  },

  async create(payload: {
    serviceDeskId: string;
    parentId?: string;
    name: string;
  }) {
    return apiRequest("/admin/classifications", {
      method: "POST",
      body: payload,
    });
  },

  async update(
    id: string,
    payload: { name?: string; active?: boolean; sortOrder?: number },
  ) {
    return apiRequest(`/admin/classifications/${id}`, {
      method: "PATCH",
      body: payload,
    });
  },

  async remove(id: string) {
    return apiRequest(`/admin/classifications/${id}`, {
      method: "DELETE",
    });
  },
};
