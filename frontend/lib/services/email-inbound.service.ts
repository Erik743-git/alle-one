import { apiRequest } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import { readBlobDownload, triggerBrowserDownload } from "@/lib/download-blob";
import { API_URL } from "@/lib/env";

export type EmailInboundSettings = {
  id: string;
  sharedMailboxAddress: string | null;
  useAsRequester: string;
  graphTenantId: string | null;
  graphClientId: string | null;
  enabled: boolean;
  lastPolledAt: string | null;
  blockedSenders: string | null;
  graphConfigured: boolean;
  graphClientSecretConfigured: boolean;
};

export type EmailInboundRoute = {
  id: string;
  matchEmail: string;
  deskId: string | null;
  companyId: string | null;
  priorityName: string | null;
  verified: boolean;
  active: boolean;
  desk?: { id: string; name: string } | null;
  company?: { id: string; name: string } | null;
};

export type PreTicketListItem = {
  id: string;
  title: string;
  fromName: string | null;
  fromEmail: string;
  mailboxAddress: string;
  channel: string;
  attachmentCount: number;
  receivedAt: string;
  company?: { id: string; name: string } | null;
  desk?: { id: string; name: string } | null;
};

export type PreTicketDetail = PreTicketListItem & {
  descriptionHtml: string | null;
  descriptionText: string | null;
  toEmails: string[];
  priorityName: string | null;
  requestorUser?: { id: string; name: string; email: string } | null;
  attachments: Array<{
    id: string;
    fileName: string;
    contentType: string | null;
    sizeBytes: number | null;
  }>;
};

export const emailInboundService = {
  getSettings() {
    return apiRequest<EmailInboundSettings>("/admin/email/settings");
  },
  updateSettings(body: Partial<EmailInboundSettings> & { enabled?: boolean }) {
    return apiRequest<EmailInboundSettings>("/admin/email/settings", {
      method: "PATCH",
      body,
    });
  },
  listRoutes() {
    return apiRequest<EmailInboundRoute[]>("/admin/email/routes");
  },
  createRoute(body: {
    matchEmail: string;
    deskId?: string;
    companyId?: string;
    priorityName?: string;
    verified?: boolean;
  }) {
    return apiRequest<EmailInboundRoute>("/admin/email/routes", {
      method: "POST",
      body,
    });
  },
  updateRoute(id: string, body: Record<string, unknown>) {
    return apiRequest<EmailInboundRoute>(`/admin/email/routes/${id}`, {
      method: "PATCH",
      body,
    });
  },
  deleteRoute(id: string) {
    return apiRequest(`/admin/email/routes/${id}`, { method: "DELETE" });
  },
  pollNow() {
    return apiRequest<{ scanned: number; created: number }>(
      "/admin/email/poll",
      { method: "POST" },
    );
  },
  countPreTickets() {
    return apiRequest<{ count: number }>("/pre-tickets/count");
  },
  listPreTickets(q?: string) {
    const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    return apiRequest<PreTicketListItem[]>(`/pre-tickets${qs}`);
  },
  getPreTicket(id: string) {
    return apiRequest<PreTicketDetail>(`/pre-tickets/${id}`);
  },
  deletePreTicket(id: string) {
    return apiRequest(`/pre-tickets/${id}`, { method: "DELETE" });
  },
  openPreTicket(
    id: string,
    body?: {
      title?: string;
      responsibleName?: string;
      deskId?: string;
      companyId?: string;
      priorityName?: string;
    },
  ) {
    return apiRequest<{ ticketNumber: number; preTicketId: string }>(
      `/pre-tickets/${id}/open`,
      { method: "POST", body: body ?? {} },
    );
  },
  async downloadPreTicketAttachment(params: {
    preTicketId: string;
    attachmentId: string;
    fileName?: string;
  }) {
    const response = await authFetch(
      `${API_URL}/pre-tickets/${params.preTicketId}/attachments/${params.attachmentId}?inline=false`,
    );
    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      let message = "Não foi possível baixar o anexo.";
      try {
        const parsed = JSON.parse(raw) as { message?: string | string[] };
        if (parsed.message) {
          message = Array.isArray(parsed.message)
            ? parsed.message.join(", ")
            : parsed.message;
        }
      } catch {
        if (raw) message = raw;
      }
      throw new Error(message);
    }
    const meta = await readBlobDownload(
      response,
      params.fileName?.trim() || "anexo",
    );
    triggerBrowserDownload(meta.blob, meta.filename);
    return meta;
  },
};

export const totpService = {
  setup() {
    return apiRequest<{ secret: string; otpauth: string; qrDataUrl: string }>(
      "/auth/2fa/setup",
      { method: "POST" },
    );
  },
  confirm(code: string) {
    return apiRequest<{ backupCodes: string[] }>("/auth/2fa/confirm", {
      method: "POST",
      body: { code },
    });
  },
  disable(code: string, password: string) {
    return apiRequest<{ ok: boolean }>("/auth/2fa/disable", {
      method: "POST",
      body: { code, password },
    });
  },
};
