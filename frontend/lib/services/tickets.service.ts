import { apiRequest } from "@/lib/api";
import { readBlobDownload } from "@/lib/download-blob";
import { authFetch } from "@/lib/auth-fetch";
import { API_URL } from "@/lib/env";

export type TicketStageGroupKey =
  | "novo"
  | "atendimento"
  | "aguardando"
  | "resolvido"
  | "encerrado"
  | "outros";

export type TicketListItem = {
  ticketNumber: number;
  title: string | null;
  clientName: string | null;
  origin: string | null;
  priorityName: string | null;
  statusName: string | null;
  stageName: string | null;
  responsibleExternalId?: number | null;
  responsibleName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  stageGroup: TicketStageGroupKey;
  externalGmudRef: string | null;
};

export type TicketListGroup = {
  key: TicketStageGroupKey;
  label: string;
  tickets: TicketListItem[];
};

export type TicketListResponse = {
  total: number;
  mineOnly: boolean;
  responsibleExternalId: number | null;
  responsibleName: string | null;
  tifluxUserResolved: boolean;
  message: string | null;
  groups: TicketListGroup[];
};

export type TicketAppointment = {
  externalId: number | null;
  portalAppointmentId: string | null;
  appointmentDate: string | null;
  initTime: string | null;
  endTime: string | null;
  minutes: number;
  userName: string | null;
  description: string | null;
  valorizationLabel: string | null;
  attendance: string | null;
  attendanceLabel: string | null;
  syncStatus: "SYNCED" | "PENDING_TIFLUX" | "PORTAL_ONLY";
  syncPaused?: boolean;
  isWarning?: boolean;
  createdByUserId?: string | null;
  canManage?: boolean;
  attachmentCount: number;
  attachments: Array<{
    id: string;
    fileId: string;
    originalName: string;
    mimeType: string;
    size: number;
    previewDataUrl: string | null;
  }>;
};

export type TicketHistoryEntry = {
  id: string;
  eventType: string;
  summary: string;
  actorName: string | null;
  createdAt: string;
};

export type TicketDetailResponse = {
  ticket: TicketListItem & {
    deskName: string | null;
    deskExternalId?: number | null;
    clientExternalId?: number | null;
    isClosed: boolean;
    isPreTicket?: boolean;
    requestorName: string | null;
    requestorEmail: string | null;
    requestorTelephone: string | null;
  };
  summary: {
    attendantsCount: number;
    totalMinutes: number;
    totalHoursFormatted: string;
    appointmentsCount: number;
  };
  appointments: TicketAppointment[];
  externalGmudRef: string | null;
  portalDescription?: {
    description: string;
    attachments: Array<{
      id: string;
      fileId: string;
      originalName: string;
      mimeType: string;
      size: number;
      previewDataUrl: string | null;
    }>;
  } | null;
  syncPending?: boolean;
  /** ADMIN ou responsável do ticket. */
  canChangeClient?: boolean;
  classificationId?: string | null;
  watchers?: Array<{ email: string }>;
  grouping?: {
    parent: {
      ticketNumber: number;
      title: string | null;
      isClosed: boolean;
    } | null;
    children: Array<{
      ticketNumber: number;
      title: string | null;
      isClosed: boolean;
      stageName: string | null;
    }>;
  };
};

export type TicketFilterCatalogs = {
  stages: string[];
  clients: Array<{ externalId: number; name: string }>;
  requestors?: Array<{ name: string }>;
  responsibles: Array<{ externalId: number; name: string; email: string | null }>;
  desks: string[];
  statuses: string[];
};

export type TicketsListParams = {
  mineOnly?: boolean;
  responsibleExternalId?: number;
  clientExternalId?: number;
  stageName?: string;
  statusName?: string;
  deskName?: string;
  requestorName?: string;
  from?: string;
  to?: string;
  ticketNumber?: number;
  search?: string;
  limit?: number;
  externalGmudRef?: string;
  /** Inclui resolvidos, encerrados, cancelados e fechados. */
  includeDone?: boolean;
};

function toQuery(params: TicketsListParams): string {
  const q = new URLSearchParams();
  if (params.mineOnly === false) q.set("mineOnly", "false");
  if (params.responsibleExternalId != null) {
    q.set("responsibleExternalId", String(params.responsibleExternalId));
  }
  if (params.clientExternalId != null) {
    q.set("clientExternalId", String(params.clientExternalId));
  }
  if (params.stageName?.trim()) q.set("stageName", params.stageName.trim());
  if (params.statusName?.trim()) q.set("statusName", params.statusName.trim());
  if (params.deskName?.trim()) q.set("deskName", params.deskName.trim());
  if (params.requestorName?.trim()) q.set("requestorName", params.requestorName.trim());
  if (params.from?.trim()) q.set("from", params.from.trim());
  if (params.to?.trim()) q.set("to", params.to.trim());
  if (params.ticketNumber != null) q.set("ticketNumber", String(params.ticketNumber));
  if (params.search?.trim()) q.set("search", params.search.trim());
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.externalGmudRef?.trim()) {
    q.set("externalGmudRef", params.externalGmudRef.trim());
  }
  if (params.includeDone === true) q.set("includeDone", "true");
  const s = q.toString();
  return s ? `?${s}` : "";
}

export type TicketClassificationNode = {
  id: string;
  name: string;
  level: number;
  active: boolean;
  sortOrder: number;
  parentId: string | null;
  children: TicketClassificationNode[];
};

export type TicketCreateCatalogs = {
  clients: Array<{ id: number; name: string; companyId?: string }>;
  desks: Array<{
    id: number;
    name: string;
    appointmentType: string;
    requireServiceCatalog: boolean;
  }>;
  responsibles: Array<{ id: number; name: string; email: string | null }>;
  requestors: Array<{
    id: number;
    name: string;
    email: string | null;
    telephone: string | null;
  }>;
  portalServiceDesk: { id: string; name: string } | null;
  classification: {
    levelLabels: Array<{ level: number; label: string }>;
    tree: TicketClassificationNode[];
  } | null;
  desk: {
    id: number;
    name: string;
    appointmentType: string;
    requireServiceCatalog: boolean;
    requiredFields: Record<string, boolean>;
  } | null;
  priorities: Array<{ id: number; name: string }>;
  catalogItems: Array<{
    id: number;
    name: string;
    catalogId?: number;
    catalogName?: string;
    areaId?: number;
    areaName?: string;
    itemName?: string;
  }>;
};

export type CreateTicketPayload = {
  title: string;
  description: string;
  clientId: number;
  deskId: number;
  priorityId?: number;
  servicesCatalogsItemId?: number;
  classificationId?: string;
  responsibleId?: number | null;
  requestorId?: number;
  requestorName: string;
  requestorEmail: string;
  requestorTelephone?: string;
  externalGmudRef?: string;
  ccEmails?: string[];
};

export type AppointmentCatalogs = {
  tifluxAppointmentSyncEnabled: boolean;
  ticket: {
    ticketNumber: number;
    clientName: string | null;
    clientExternalId: number | null;
    deskName: string | null;
    deskExternalId: number | null;
    stageName: string | null;
    stageGroup: TicketStageGroupKey;
    appointmentType: string;
    tifluxSyncAvailable: boolean;
  };
  projectLink?: {
    project: { id: string; code: number; name: string };
    activities: Array<{ id: string; wbsCode: string; name: string; label: string }>;
  } | null;
  serviceTypes: string[];
  attendances: Array<{ value: string; label: string }>;
};

export type PortalAppointmentAttachment = {
  id: string;
  fileId: string;
  portalAppointmentId: string | null;
  originalName: string;
  mimeType: string;
  size: number;
  tifluxAppointmentExternalId: number | null;
  createdAt: string;
};

export type CreateAppointmentPayload = {
  date: string;
  initTime: string;
  endTime: string;
  /** Fim no dia seguinte (YYYY-MM-DD). */
  endDate?: string;
  description: string;
  serviceName: string;
  attendance: "Remote" | "External" | "Internal";
  projectActivityId?: string;
  removeAttachmentFileIds?: string[];
  /** Envia e-mail ao responsável e aos seguidores. */
  notifyClient?: boolean;
  /** Atenção: exige leitura dos demais usuários. */
  isWarning?: boolean;
};

export type CreateTicketResult = {
  ok: boolean;
  ticketNumber: number;
  isPreTicket?: boolean;
  message: string;
};

export type CreateAppointmentResult = {
  ok: boolean;
  appointmentId: number | null;
  portalAppointmentId?: string;
  outboxId?: string | null;
  attachmentsCount?: number;
  tifluxSynced?: boolean;
  portalOnly?: boolean;
  message: string;
};

export type TicketStageOption = {
  id: number;
  name: string;
  firstStage: boolean;
  lastStage: boolean;
};

export type TicketStagesResponse = {
  deskExternalId: number | null;
  deskName: string | null;
  currentStageId: number | null;
  currentStageName: string | null;
  isClosed: boolean;
  stages: TicketStageOption[];
};

export type UpdateTicketStageResult = {
  ok: boolean;
  stageId: number;
  stageName: string;
  stageGroup: TicketStageGroupKey;
  isClosed?: boolean;
  message: string;
};

export type UpdateTicketPayload = {
  title?: string;
  description?: string;
  responsibleId?: number | null;
  responsibleName?: string | null;
  stageName?: string;
  statusName?: string;
  isClosed?: boolean;
  /** tiflux client id — só ADMIN */
  clientId?: number;
  deskId?: number;
  classificationId?: string | null;
  requestorId?: number;
  requestorName?: string;
  requestorEmail?: string;
  requestorTelephone?: string | null;
  removeAttachmentFileIds?: string[];
  externalGmudRef?: string;
};

export type UpdateTicketResult = {
  ok: boolean;
  ticketNumber: number;
  isPreTicket?: boolean;
  message: string;
};

export type PortalAppointmentEditContext = {
  portalAppointmentId: string;
  ticketNumber: number;
  date: string;
  initTime: string;
  endTime: string;
  serviceName: string;
  attendance: string;
  description: string;
  descriptionPlain: string;
  notifyClient?: boolean;
  isWarning?: boolean;
  attachments?: Array<{
    id: string;
    fileId: string;
    originalName: string;
    mimeType: string;
    size: number;
    previewDataUrl: string | null;
  }>;
  syncStatus: "PENDING_TIFLUX" | "SYNCED" | "PORTAL_ONLY";
  syncPaused: boolean;
  existsInTiflux: boolean;
  canPauseSync: boolean;
};

export type TicketAppointmentWarningListItem = {
  portalAppointmentId: string;
  appointmentDate: string;
  initTime: string;
  endTime: string;
  userName: string;
  descriptionPreview: string;
};

export type TicketAppointmentWarningDetail = {
  portalAppointmentId: string;
  ticketNumber: number;
  ticketTitle: string;
  appointmentDate: string;
  initTime: string;
  endTime: string;
  userName: string;
  description: string;
  descriptionPlain: string;
  attachments: TicketAppointment["attachments"];
};

export const ticketsService = {
  list(params: TicketsListParams = {}) {
    return apiRequest<TicketListResponse>(`/tickets${toQuery(params)}`);
  },

  catalogs() {
    return apiRequest<TicketFilterCatalogs>("/tickets/catalogs/filters");
  },

  createCatalogs(params?: { deskId?: number; clientId?: number }) {
    const qs = new URLSearchParams();
    if (params?.deskId != null) {
      qs.set("deskId", String(params.deskId));
    }
    if (params?.clientId != null) {
      qs.set("clientId", String(params.clientId));
    }
    const q = qs.toString();
    return apiRequest<TicketCreateCatalogs>(
      `/tickets/catalogs/create${q ? `?${q}` : ""}`,
    );
  },

  searchUsers(q: string) {
    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    const query = qs.toString();
    return apiRequest<
      Array<{
        id: string;
        name: string;
        email: string;
        role: string;
        companyId: string | null;
      }>
    >(`/tickets/users/search${query ? `?${query}` : ""}`);
  },

  createTicket(payload: CreateTicketPayload, files: File[] = []) {
    const body = new FormData();
    body.append("payload", JSON.stringify(payload));
    for (const file of files) {
      body.append("files", file);
    }
    return apiRequest<CreateTicketResult>("/tickets", {
      method: "POST",
      body,
    });
  },

  detail(ticketNumber: number) {
    return apiRequest<TicketDetailResponse>(`/tickets/${ticketNumber}`);
  },

  getTicketHistory(ticketNumber: number) {
    return apiRequest<TicketHistoryEntry[]>(`/tickets/${ticketNumber}/history`);
  },

  listStages(ticketNumber: number) {
    return apiRequest<TicketStagesResponse>(`/tickets/${ticketNumber}/stages`);
  },

  updateStage(ticketNumber: number, stageId: number) {
    return apiRequest<UpdateTicketStageResult>(`/tickets/${ticketNumber}/stage`, {
      method: "PATCH",
      body: { stageId },
    });
  },

  updateTicket(
    ticketNumber: number,
    payload: UpdateTicketPayload,
    files: File[] = [],
  ) {
    const body = new FormData();
    body.append("payload", JSON.stringify(payload));
    for (const file of files) {
      body.append("files", file);
    }
    return apiRequest<UpdateTicketResult>(`/tickets/${ticketNumber}`, {
      method: "PATCH",
      body,
    });
  },

  addWatcher(ticketNumber: number, email: string) {
    return apiRequest<{ ok: boolean; message: string }>(
      `/tickets/${ticketNumber}/watchers`,
      { method: "POST", body: { email } },
    );
  },

  removeWatcher(ticketNumber: number, email: string) {
    return apiRequest<{ ok: boolean; message: string }>(
      `/tickets/${ticketNumber}/watchers/${encodeURIComponent(email)}`,
      { method: "DELETE" },
    );
  },

  linkGmud(ticketNumber: number, externalGmudRef: string | null) {
    return apiRequest<{ ok: boolean; externalGmudRef: string | null }>(
      `/tickets/${ticketNumber}/gmud`,
      { method: "PATCH", body: { externalGmudRef } },
    );
  },

  groupTicket(ticketNumber: number, parentTicketNumber: number) {
    return apiRequest<{
      ok: boolean;
      ticketNumber: number;
      parentTicketNumber: number;
      message: string;
    }>(`/tickets/${ticketNumber}/group`, {
      method: "POST",
      body: { parentTicketNumber },
    });
  },

  appointmentCatalogs(ticketNumber: number) {
    return apiRequest<AppointmentCatalogs>(
      `/tickets/${ticketNumber}/catalogs/appointment`,
    );
  },

  pendingAppointmentWarnings(ticketNumber: number) {
    return apiRequest<{
      ticketTitle: string;
      warnings: TicketAppointmentWarningListItem[];
    }>(`/tickets/${ticketNumber}/warnings/pending`);
  },

  appointmentWarningDetail(ticketNumber: number, portalAppointmentId: string) {
    return apiRequest<TicketAppointmentWarningDetail>(
      `/tickets/${ticketNumber}/warnings/${portalAppointmentId}`,
    );
  },

  acknowledgeAppointmentWarning(
    ticketNumber: number,
    portalAppointmentId: string,
    permanent: boolean,
  ) {
    return apiRequest<{ ok: boolean; message: string; permanent?: boolean }>(
      `/tickets/${ticketNumber}/warnings/${portalAppointmentId}/acknowledge`,
      {
        method: "POST",
        body: { permanent },
      },
    );
  },

  createAppointment(
    ticketNumber: number,
    payload: CreateAppointmentPayload,
    files: File[] = [],
  ) {
    const body = new FormData();
    body.append("payload", JSON.stringify(payload));
    for (const file of files) {
      body.append("files", file);
    }
    return apiRequest<CreateAppointmentResult>(
      `/tickets/${ticketNumber}/appointments`,
      { method: "POST", body },
    );
  },

  appointmentEditContext(ticketNumber: number, portalAppointmentId: string) {
    return apiRequest<PortalAppointmentEditContext>(
      `/tickets/${ticketNumber}/appointments/${portalAppointmentId}/edit-context`,
    );
  },

  pauseAppointmentSync(ticketNumber: number, portalAppointmentId: string) {
    return apiRequest<{ ok: boolean; syncPaused: boolean }>(
      `/tickets/${ticketNumber}/appointments/${portalAppointmentId}/pause-sync`,
      { method: "POST" },
    );
  },

  resumeAppointmentSync(ticketNumber: number, portalAppointmentId: string) {
    return apiRequest<{ ok: boolean; syncPaused: boolean }>(
      `/tickets/${ticketNumber}/appointments/${portalAppointmentId}/resume-sync`,
      { method: "POST" },
    );
  },

  updateAppointment(
    ticketNumber: number,
    portalAppointmentId: string,
    payload: CreateAppointmentPayload,
    files: File[] = [],
  ) {
    const body = new FormData();
    body.append("payload", JSON.stringify(payload));
    for (const file of files) {
      body.append("files", file);
    }
    return apiRequest<{ ok: boolean; message: string }>(
      `/tickets/${ticketNumber}/appointments/${portalAppointmentId}`,
      { method: "PATCH", body },
    );
  },

  deleteAppointment(ticketNumber: number, portalAppointmentId: string) {
    return apiRequest<{ ok: boolean; message: string }>(
      `/tickets/${ticketNumber}/appointments/${portalAppointmentId}`,
      { method: "DELETE" },
    );
  },

  async fetchAttachment(params: { fileId: string; inline?: boolean }) {
    const qs = new URLSearchParams({
      inline: params.inline === false ? "false" : "true",
    });
    const response = await authFetch(
      `${API_URL}/tickets/attachments/${params.fileId}?${qs}`,
    );
    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      let message = "Não foi possível carregar o anexo.";
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
    return readBlobDownload(response, "anexo");
  },
};
