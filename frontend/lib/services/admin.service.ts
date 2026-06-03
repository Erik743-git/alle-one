import { apiRequest } from "@/lib/api";

export type AdminOverviewStats = {
  companiesActive: number;
  companiesTotal: number;
  usersActive: number;
  adminUsers: number;
  contractFilesCount: number;
};

export type AuditLogItem = {
  id: string;
  createdAt: string;
  userId: string | null;
  user: { id: string; name: string; email: string; role: string } | null;
  action: string;
  entity: string;
  entityId: string | null;
  payload: unknown;
};

export type ListAuditLogsResponse = {
  total: number;
  offset: number;
  limit: number;
  items: AuditLogItem[];
};

export const adminService = {
  async overviewStats() {
    return apiRequest<AdminOverviewStats>("/admin/overview-stats");
  },

  async listAuditLogs(params: {
    offset?: number;
    limit?: number;
    from?: string;
    to?: string;
    actorId?: string;
    entity?: string;
    action?: string;
    order?: "asc" | "desc";
  }) {
    const qs = new URLSearchParams();
    if (params.offset != null) qs.set("offset", String(params.offset));
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (params.actorId) qs.set("actorId", params.actorId);
    if (params.entity) qs.set("entity", params.entity);
    if (params.action) qs.set("action", params.action);
    if (params.order) qs.set("order", params.order);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return apiRequest<ListAuditLogsResponse>(`/admin/audit-logs${suffix}`);
  },

  async reprocessRendimentoAlerts(body?: {
    userId?: string;
    from?: string;
    to?: string;
  }) {
    return apiRequest<{
      usersProcessed: number;
      daysProcessed: number;
      eventsPurged: number;
      eventsUpserted: number;
      rangeStart: string;
      rangeEnd: string;
      message: string;
    }>("/admin/reprocess-rendimento-alerts", {
      method: "POST",
      body: body ?? {},
    });
  },
};
