import { apiRequest } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";

export type ReportFormat = "CSV" | "PDF" | "XLSX";

export type ReportRow = {
  id: string;
  companyId: string;
  company: { id: string; name: string };
  type: string;
  format: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  generatedBy: string;
  createdAt: string;
  file: {
    id: string;
    originalName: string;
    mimeType: string | null;
    size: number;
    createdAt: string;
  };
};

export type ReportCompanyOption = { id: string; name: string };

export const reportsService = {
  async listCompanies() {
    return apiRequest<ReportCompanyOption[]>("/reports/companies");
  },

  async list(params?: {
    companyId?: string;
    type?: string;
    start?: string;
    end?: string;
  }) {
    const search = new URLSearchParams();
    if (params?.companyId) search.set("companyId", params.companyId);
    if (params?.type) search.set("type", params.type);
    if (params?.start) search.set("start", params.start);
    if (params?.end) search.set("end", params.end);
    const qs = search.toString();
    return apiRequest<ReportRow[]>(`/reports${qs ? `?${qs}` : ""}`);
  },

  async last(params?: { companyId?: string; type?: string }) {
    const search = new URLSearchParams();
    if (params?.companyId) search.set("companyId", params.companyId);
    if (params?.type) search.set("type", params.type);
    const qs = search.toString();
    return apiRequest<ReportRow | null>(`/reports/last${qs ? `?${qs}` : ""}`);
  },

  async generate(payload: {
    companyId: string;
    type: string;
    format: ReportFormat;
    start: string;
    end: string;
  }) {
    return apiRequest<ReportRow>("/reports/generate", {
      method: "POST",
      body: payload,
    });
  },

  async download(reportId: string) {
    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

    const res = await authFetch(`${API_URL}/reports/${reportId}/download`, {
      method: "GET",
    });

    if (res.status === 401) {
      throw new Error("Sessão expirada. Faça login novamente.");
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Falha ao baixar relatório (${res.status}).`);
    }

    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition") ?? "";
    const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
    const filename = filenameMatch?.[1] ? decodeURIComponent(filenameMatch[1]) : `report-${reportId}`;
    return { blob, filename };
  },
};

