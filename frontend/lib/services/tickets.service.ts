import { apiRequest } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import { API_URL } from "@/lib/env";

export type TicketStageGroupKey = "pendente" | "aguardando" | "execucao" | "outros";

export type TicketListItem = {
  ticketNumber: number;
  title: string | null;
  clientName: string | null;
  origin: string | null;
  priorityName: string | null;
  statusName: string | null;
  stageName: string | null;
  responsibleName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  stageGroup: TicketStageGroupKey;
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
  attachmentCount: number;
  attachments: Array<{
    id: string;
    fileId: string;
    originalName: string;
    mimeType: string;
    size: number;
  }>;
};

export type TicketDetailResponse = {
  ticket: TicketListItem & {
    deskName: string | null;
    isClosed: boolean;
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
};

export type TicketFilterCatalogs = {
  stages: string[];
  clients: Array<{ externalId: number; name: string }>;
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
  from?: string;
  to?: string;
  ticketNumber?: number;
  search?: string;
  limit?: number;
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
  if (params.from?.trim()) q.set("from", params.from.trim());
  if (params.to?.trim()) q.set("to", params.to.trim());
  if (params.ticketNumber != null) q.set("ticketNumber", String(params.ticketNumber));
  if (params.search?.trim()) q.set("search", params.search.trim());
  if (params.limit != null) q.set("limit", String(params.limit));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export type TicketCreateCatalogs = {
  clients: Array<{ id: number; name: string }>;
  desks: Array<{
    id: number;
    name: string;
    appointmentType: string;
    requireServiceCatalog: boolean;
  }>;
  responsibles: Array<{ id: number; name: string; email: string | null }>;
  desk: {
    id: number;
    name: string;
    appointmentType: string;
    requireServiceCatalog: boolean;
    requiredFields: Record<string, boolean>;
  } | null;
  priorities: Array<{ id: number; name: string }>;
  catalogItems: Array<{ id: number; name: string }>;
};

export type CreateTicketPayload = {
  title: string;
  description: string;
  clientId: number;
  deskId: number;
  priorityId?: number;
  servicesCatalogsItemId?: number;
  responsibleId?: number;
  requestorName?: string;
  requestorEmail?: string;
  requestorTelephone?: string;
};

export type AppointmentCatalogs = {
  ticket: {
    ticketNumber: number;
    clientName: string | null;
    clientExternalId: number | null;
    deskName: string | null;
    deskExternalId: number | null;
    appointmentType: string;
  };
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
  description: string;
  serviceName: string;
  attendance: "Remote" | "External" | "Internal";
};

export type CreateTicketResult = {
  ok: boolean;
  ticketNumber: number;
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

export const ticketsService = {
  list(params: TicketsListParams = {}) {
    return apiRequest<TicketListResponse>(`/tickets${toQuery(params)}`);
  },

  catalogs() {
    return apiRequest<TicketFilterCatalogs>("/tickets/catalogs/filters");
  },

  createCatalogs(deskId?: number) {
    const q =
      deskId != null ? `?deskId=${encodeURIComponent(String(deskId))}` : "";
    return apiRequest<TicketCreateCatalogs>(`/tickets/catalogs/create${q}`);
  },

  createTicket(payload: CreateTicketPayload) {
    return apiRequest<CreateTicketResult>("/tickets", {
      method: "POST",
      body: payload,
    });
  },

  detail(ticketNumber: number) {
    return apiRequest<TicketDetailResponse>(`/tickets/${ticketNumber}`);
  },

  appointmentCatalogs(ticketNumber: number) {
    return apiRequest<AppointmentCatalogs>(
      `/tickets/${ticketNumber}/catalogs/appointment`,
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
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const match = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i.exec(disposition);
    const filename = decodeURIComponent(match?.[1] ?? match?.[2] ?? "anexo");
    const mimeType =
      response.headers.get("Content-Type") ??
      blob.type ??
      "application/octet-stream";
    return { blob, filename, mimeType };
  },
};
