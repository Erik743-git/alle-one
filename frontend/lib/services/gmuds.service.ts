import { apiRequest } from "@/lib/api";
import { isValidCompanyUuid } from "@/lib/selected-company";
import { authFetch } from "@/lib/auth-fetch";
import { readBlobDownload } from "@/lib/download-blob";
import { API_URL } from "@/lib/env";

export type GmudStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "IN_EXECUTION"
  | "EXECUTED"
  | "REJECTED"
  | "CANCELED";

export type GmudUser = {
  id: string;
  name: string;
  email: string;
};

export type GmudActivity = {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  executorUserId: string;
  description: string;
};

export type GmudAttachment = {
  id: string;
  createdAt: string;
  file: {
    id: string;
    originalName: string;
    mimeType: string;
    path: string;
    size: number;
    createdAt: string;
  };
  uploader: GmudUser;
};

export type Gmud = {
  id: string;
  code: number;
  companyId: string;
  company: { id: string; name: string };
  title: string;
  downtime: boolean;
  downtimeStart: string | null;
  downtimeEnd: string | null;
  responsibleId: string | null;
  responsible: GmudUser | null;
  description: string | null;
  reason: string | null;
  impact: string | null;
  rollback: string | null;
  status: GmudStatus;
  approvedAt: string | null;
  executionStartedAt: string | null;
  executedAt: string | null;
  createdBy: string;
  creator: GmudUser;
  createdAt: string;
  updatedAt: string;
  executors: Array<{ user: GmudUser }>;
  approvers: Array<{ user: GmudUser; status: "PENDING" | "APPROVED" | "REJECTED"; decidedAt: string | null; decisionNote: string | null }>;
  activities: GmudActivity[];
  attachments: GmudAttachment[];
};

export type SearchUserResult = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "COLLABORATOR" | "PJ" | "CLIENT";
  companyId: string | null;
};

export type CreateGmudPayload = {
  title: string;
  companyId: string;
  downtime: boolean;
  downtimeStart?: string;
  downtimeEnd?: string;
  responsibleId?: string;
  description?: string;
  reason?: string;
  impact?: string;
  rollback?: string;
  executors: Array<{ userId: string }>;
  approvers: Array<{ userId: string }>;
  activities?: Array<{
    scheduledAt: string;
    durationMinutes: number;
    executorUserId: string;
    description: string;
  }>;
  submitForApproval?: boolean;
};

export type UpdateGmudPayload = Partial<CreateGmudPayload>;

export type GmudCompanyOption = {
  id: string;
  name: string;
};

export const gmudsService = {
  async listCompanies() {
    return apiRequest<GmudCompanyOption[]>("/gmuds/companies");
  },

  async list(params?: { companyId?: string; status?: GmudStatus }) {
    const search = new URLSearchParams();
    if (isValidCompanyUuid(params?.companyId)) {
      search.set("companyId", params!.companyId!);
    }
    if (params?.status) search.set("status", params.status);
    const qs = search.toString();
    return apiRequest<Gmud[]>(`/gmuds${qs ? `?${qs}` : ""}`);
  },

  async getById(id: string) {
    return apiRequest<Gmud>(`/gmuds/${id}`);
  },

  async exportPdf(id: string) {
    const response = await authFetch(`${API_URL}/gmuds/${id}/pdf`);
    if (response.status === 401) {
      throw new Error("Sessão expirada. Faça login novamente.");
    }
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
      const apiMessage = data?.message ? (Array.isArray(data.message) ? data.message[0] : data.message) : null;
      const textMessage = apiMessage ? "" : await response.text().catch(() => "");
      throw new Error(apiMessage || textMessage || "Falha ao exportar PDF da GMUD.");
    }
    return readBlobDownload(response, `GMUD-${id}.pdf`);
  },

  async create(payload: CreateGmudPayload) {
    return apiRequest<Gmud>("/gmuds", { method: "POST", body: payload });
  },

  async update(id: string, payload: UpdateGmudPayload) {
    return apiRequest<Gmud>(`/gmuds/${id}`, { method: "PATCH", body: payload });
  },

  async approve(id: string, payload: { decision: "APPROVE" | "REJECT"; note?: string }) {
    return apiRequest<Gmud>(`/gmuds/${id}/approve`, { method: "POST", body: payload });
  },

  async approveOnBehalf(params: {
    id: string;
    onBehalfOfUserId: string;
    decision: "APPROVE" | "REJECT";
    note?: string;
    evidence: File;
  }) {
    const form = new FormData();
    form.append("onBehalfOfUserId", params.onBehalfOfUserId);
    form.append("decision", params.decision);
    if (params.note) form.append("note", params.note);
    form.append("evidence", params.evidence);

    const response = await authFetch(`${API_URL}/gmuds/${params.id}/approve-on-behalf`, {
      method: "POST",
      body: form,
    });

    if (response.status === 401) {
      throw new Error("Sessão expirada. Faça login novamente.");
    }

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
      const apiMessage = data?.message ? (Array.isArray(data.message) ? data.message[0] : data.message) : null;
      const textMessage = apiMessage ? "" : await response.text().catch(() => "");
      throw new Error(apiMessage || textMessage || "Falha ao aprovar em nome.");
    }

    return (await response.json()) as Gmud;
  },

  async startExecution(id: string) {
    return apiRequest<Gmud>(`/gmuds/${id}/execution/start`, { method: "POST" });
  },

  async completeExecution(id: string) {
    return apiRequest<Gmud>(`/gmuds/${id}/execution/complete`, { method: "POST" });
  },

  async cancel(id: string) {
    return apiRequest<Gmud>(`/gmuds/${id}/cancel`, { method: "POST" });
  },

  async searchUsers(params: { companyId?: string; q?: string }) {
    const search = new URLSearchParams();
    if (isValidCompanyUuid(params.companyId)) {
      search.set("companyId", params.companyId);
    }
    if (params.q) search.set("q", params.q);
    const qs = search.toString();
    return apiRequest<SearchUserResult[]>(`/gmuds/users/search${qs ? `?${qs}` : ""}`);
  },

  async addAttachment(id: string, file: File) {
    const form = new FormData();
    form.append("file", file);

    const response = await authFetch(`${API_URL}/gmuds/${id}/attachments`, {
      method: "POST",
      body: form,
    });

    if (response.status === 401) {
      throw new Error("Sessão expirada. Faça login novamente.");
    }

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
      const apiMessage = data?.message ? (Array.isArray(data.message) ? data.message[0] : data.message) : null;
      const textMessage = apiMessage ? "" : await response.text().catch(() => "");
      throw new Error(apiMessage || textMessage || "Falha ao enviar anexo.");
    }

    return (await response.json()) as GmudAttachment;
  },

  async downloadAttachment(id: string, attachmentId: string, fallbackName = "anexo") {
    const response = await authFetch(
      `${API_URL}/gmuds/${id}/attachments/${attachmentId}`,
    );

    if (response.status === 401) {
      throw new Error("Sessão expirada. Faça login novamente.");
    }
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
      const apiMessage = data?.message
        ? Array.isArray(data.message)
          ? data.message[0]
          : data.message
        : null;
      throw new Error(apiMessage || "Falha ao baixar anexo.");
    }

    return readBlobDownload(response, fallbackName);
  },
};

