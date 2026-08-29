import { apiRequest } from "@/lib/api";

export type AdminOverviewStats = {
  companiesActive: number;
  companiesTotal: number;
  usersActive: number;
  usersOnline: number;
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

export type TicketStage = {
  id: string;
  name: string;
  isSystem: boolean;
  syncsToTiflux: boolean;
  active: boolean;
  sortOrder: number;
};

export type TicketAutoOpenPeriodicity =
  | "ONCE"
  | "DAILY"
  | "DAILY_WEEKDAYS"
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "BIMONTHLY"
  | "QUARTERLY"
  | "SEMIANNUAL"
  | "YEARLY";

export const TICKET_AUTO_OPEN_PERIODICITY_OPTIONS: Array<{
  value: TicketAutoOpenPeriodicity;
  label: string;
}> = [
  { value: "ONCE", label: "Apenas uma vez" },
  { value: "DAILY", label: "Todo dia" },
  { value: "DAILY_WEEKDAYS", label: "Todo dia (sem fim de semana)" },
  { value: "WEEKLY", label: "Toda semana" },
  { value: "BIWEEKLY", label: "A cada duas semanas" },
  { value: "MONTHLY", label: "Todo mês" },
  { value: "BIMONTHLY", label: "A cada dois meses" },
  { value: "QUARTERLY", label: "A cada três meses" },
  { value: "SEMIANNUAL", label: "A cada seis meses" },
  { value: "YEARLY", label: "A cada um ano" },
];

export type TicketAutoOpenRule = {
  id: string;
  name: string;
  active: boolean;
  periodicity: TicketAutoOpenPeriodicity;
  periodicityLabel: string;
  nextScheduledDate: string;
  scheduleTime: string;
  deskExternalId: number;
  clientExternalId: number;
  responsibleExternalId: number | null;
  priorityExternalId: number | null;
  servicesCatalogsItemId: number | null;
  classificationId: string | null;
  title: string;
  description: string;
  requestorName: string;
  requestorEmail: string;
  requestorTelephone: string | null;
  requestorExternalId: number | null;
  externalGmudRef: string | null;
  ccEmails: string[];
  parentTicketNumber: number | null;
  lastRunAt: string | null;
  lastTicketNumber: number | null;
  createdAt: string;
};

export type TicketAutoOpenRulePayload = {
  name: string;
  active?: boolean;
  periodicity: TicketAutoOpenPeriodicity;
  nextScheduledDate: string;
  scheduleTime: string;
  deskId: number;
  clientId: number;
  responsibleId?: number | null;
  priorityId?: number;
  servicesCatalogsItemId?: number;
  classificationId?: string;
  title: string;
  description: string;
  requestorName: string;
  requestorEmail: string;
  requestorTelephone?: string;
  requestorId?: number;
  externalGmudRef?: string;
  ccEmails?: string[];
  parentTicketNumber?: number;
};

export type TicketAutomationTrigger =
  | "STAGE_CHANGE"
  | "TICKET_OPENED"
  | "TICKET_IDLE"
  | "TICKET_NEW_REPLY";

export type TicketAutomationSetFieldName =
  | "title"
  | "stageName"
  | "statusName"
  | "isClosed"
  | "clientId"
  | "deskId"
  | "responsibleId";

export type TicketAutomationEmailRecipient =
  | "REQUESTOR"
  | "RESPONSIBLE"
  | "WATCHERS"
  | "CUSTOM";

export type TicketAutomationConditions = {
  deskExternalId?: number | null;
  clientExternalId?: number | null;
  classificationId?: string | null;
  stageOnEntry?: string | null;
  stageOnExit?: string | null;
  idleMinutes?: number | null;
  idleStageName?: string | null;
};

export type TicketAutomationAction =
  | { type: "SET_STAGE"; stageName: string }
  | { type: "SET_RESPONSIBLE"; responsibleExternalId: number }
  | {
      type: "ADD_APPOINTMENT";
      description: string;
      notifyClient?: boolean;
    }
  | {
      type: "SET_FIELD";
      field: TicketAutomationSetFieldName;
      value: string | number | boolean;
    }
  | {
      type: "SEND_EMAIL";
      recipient: TicketAutomationEmailRecipient;
      customTo?: string | null;
      subject: string;
      body: string;
    }
  | {
      type: "TRIGGER_WEBHOOK";
      url: string;
      secret?: string | null;
    };

export const TICKET_AUTOMATION_TRIGGER_OPTIONS: Array<{
  value: TicketAutomationTrigger;
  label: string;
}> = [
  { value: "STAGE_CHANGE", label: "Ticket alterar o estágio" },
  { value: "TICKET_OPENED", label: "Ticket aberto" },
  { value: "TICKET_IDLE", label: "Ticket permanece por um tempo" },
  { value: "TICKET_NEW_REPLY", label: "Nova resposta no ticket" },
];

export const TICKET_AUTOMATION_ACTION_OPTIONS: Array<{
  value: TicketAutomationAction["type"];
  label: string;
}> = [
  { value: "SET_STAGE", label: "Alterar estágio" },
  { value: "SET_RESPONSIBLE", label: "Definir responsável" },
  { value: "ADD_APPOINTMENT", label: "Registrar apontamento" },
  { value: "SET_FIELD", label: "Alterar campo" },
  { value: "SEND_EMAIL", label: "Enviar e-mail" },
  { value: "TRIGGER_WEBHOOK", label: "Disparar webhook" },
];

export type TicketAutomationRule = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  trigger: TicketAutomationTrigger;
  conditions: TicketAutomationConditions;
  actions: TicketAutomationAction[];
  sortOrder: number;
  createdAt: string;
};

export type TicketAutomationRulePayload = {
  name: string;
  description?: string;
  active?: boolean;
  trigger?: TicketAutomationTrigger;
  conditions: TicketAutomationConditions;
  actions: TicketAutomationAction[];
  sortOrder?: number;
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

  async listTicketStages() {
    return apiRequest<TicketStage[]>("/admin/ticket-stages");
  },

  async createTicketStage(body: {
    name: string;
    syncsToTiflux?: boolean;
  }) {
    return apiRequest<TicketStage>("/admin/ticket-stages", {
      method: "POST",
      body,
    });
  },

  async updateTicketStage(
    id: string,
    body: {
      name?: string;
      syncsToTiflux?: boolean;
      active?: boolean;
      sortOrder?: number;
    },
  ) {
    return apiRequest<TicketStage>(`/admin/ticket-stages/${id}`, {
      method: "PATCH",
      body,
    });
  },

  async deleteTicketStage(id: string) {
    return apiRequest<{ ok: boolean }>(`/admin/ticket-stages/${id}`, {
      method: "DELETE",
    });
  },

  async listTicketAutoOpenRules() {
    return apiRequest<TicketAutoOpenRule[]>("/admin/ticket-auto-open-rules");
  },

  async createTicketAutoOpenRule(body: TicketAutoOpenRulePayload) {
    return apiRequest<TicketAutoOpenRule>("/admin/ticket-auto-open-rules", {
      method: "POST",
      body,
    });
  },

  async updateTicketAutoOpenRule(id: string, body: TicketAutoOpenRulePayload) {
    return apiRequest<TicketAutoOpenRule>(
      `/admin/ticket-auto-open-rules/${id}`,
      {
        method: "PATCH",
        body,
      },
    );
  },

  async setTicketAutoOpenRuleActive(id: string, active: boolean) {
    return apiRequest<TicketAutoOpenRule>(
      `/admin/ticket-auto-open-rules/${id}/active`,
      {
        method: "PATCH",
        body: { active },
      },
    );
  },

  async deleteTicketAutoOpenRule(id: string) {
    return apiRequest<{ ok: boolean }>(
      `/admin/ticket-auto-open-rules/${id}`,
      { method: "DELETE" },
    );
  },

  async runDueTicketAutoOpenRules() {
    return apiRequest<{
      processed: number;
      errors: number;
      results: Array<{
        ruleId: string;
        ruleName: string;
        ok: boolean;
        ticketNumber?: number;
        isPreTicket?: boolean;
        error?: string;
      }>;
    }>("/admin/ticket-auto-open-rules/run-due", { method: "POST" });
  },

  async listTicketAutomationRules() {
    return apiRequest<TicketAutomationRule[]>("/admin/ticket-automation-rules");
  },

  async createTicketAutomationRule(body: TicketAutomationRulePayload) {
    return apiRequest<TicketAutomationRule>("/admin/ticket-automation-rules", {
      method: "POST",
      body,
    });
  },

  async updateTicketAutomationRule(
    id: string,
    body: TicketAutomationRulePayload,
  ) {
    return apiRequest<TicketAutomationRule>(
      `/admin/ticket-automation-rules/${id}`,
      {
        method: "PATCH",
        body,
      },
    );
  },

  async setTicketAutomationRuleActive(id: string, active: boolean) {
    return apiRequest<TicketAutomationRule>(
      `/admin/ticket-automation-rules/${id}/active`,
      {
        method: "PATCH",
        body: { active },
      },
    );
  },

  async deleteTicketAutomationRule(id: string) {
    return apiRequest<{ ok: boolean }>(
      `/admin/ticket-automation-rules/${id}`,
      { method: "DELETE" },
    );
  },
};
