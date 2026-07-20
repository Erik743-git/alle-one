import { apiRequest } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import { readBlobDownload, triggerBrowserDownload } from "@/lib/download-blob";
import { API_URL } from "@/lib/env";

export type ProjectCompany = {
  id: string;
  name: string;
  projectsCount: number;
};

export type ProjectStatus =
  | "PLANNING"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "COMPLETED"
  | "CANCELED";

export type ProjectBudgetUnit = "HOURS" | "DAYS";

export type ProjectCompletionApprovalStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED";

export type ProjectBudget = {
  unit: ProjectBudgetUnit | null;
  amount: number | null;
  consumedDays: number;
  consumedHours: number;
  consumedInUnit: number | null;
  exceeded: boolean;
  unitLabel: string;
};

export type ProjectCompletionApproval = {
  status: ProjectCompletionApprovalStatus;
  approvedByName: string | null;
  approvedAt: string | null;
  note: string | null;
};

export type ProjectDocument = {
  id: string;
  fileId: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

export type ProjectActivityAppointment = {
  id: string;
  portalAppointmentId: string;
  appointmentDate: string;
  initTime: string;
  endTime: string;
  description: string;
  authorName: string;
  minutes?: number;
};

export type ProjectSummary = {
  id: string;
  code: number;
  companyId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  ticketNumber: number | null;
  startDate: string | null;
  endDate: string | null;
  progressPercent: number;
  activitiesCount: number;
  budget: ProjectBudget;
  completionApproval: ProjectCompletionApproval;
  documentsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectActivityKind = "PHASE" | "TASK" | "MILESTONE";
export type ProjectActivityStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export type ProjectActivityPredecessor = {
  id: string;
  wbsCode: string;
  name: string;
  completed: boolean;
};

export type ProjectTicketAppointment = {
  portalAppointmentId: string;
  appointmentDate: string;
  initTime: string;
  endTime: string;
  minutes: number;
  description: string;
  authorName: string;
  serviceName: string;
  attendance: string | null;
  linkedActivityId: string | null;
  linkedActivityLabel: string | null;
  linkId: string | null;
};

export type ProjectActivity = {
  id: string;
  projectId: string;
  parentId: string | null;
  wbsCode: string;
  name: string;
  kind: ProjectActivityKind;
  level: number;
  sortOrder: number;
  durationDays: number | null;
  durationHours: number | null;
  startDate: string | null;
  endDate: string | null;
  actualDurationDays: number | null;
  actualDurationHours: number | null;
  progressPercent: number;
  activityStatus: ProjectActivityStatus;
  completedAt: string | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
  assigneeDisplayName: string | null;
  isMilestone: boolean;
  notes: string | null;
  predecessorIds: string[];
  predecessors: ProjectActivityPredecessor[];
  predecessorsComplete: boolean;
  canStart: boolean;
  appointments: ProjectActivityAppointment[];
  children: ProjectActivity[];
};

export type ProjectDetail = ProjectSummary & {
  company: { id: string; name: string };
  activities: ProjectActivity[];
  documents: ProjectDocument[];
};

export type ProjectHistoryEntry = {
  id: string;
  eventType: string;
  summary: string;
  actorName: string | null;
  createdAt: string;
  entityType?: string | null;
  entityId?: string | null;
  payload?: unknown;
};

export const PROJECT_BUDGET_UNIT_LABELS: Record<ProjectBudgetUnit, string> = {
  HOURS: "Horas",
  DAYS: "Dias",
};

export const PROJECT_APPROVAL_LABELS: Record<ProjectCompletionApprovalStatus, string> = {
  NOT_REQUIRED: "Não necessária",
  PENDING: "Aguardando admin",
  APPROVED: "Aprovada",
  REJECTED: "Rejeitada",
};

export type ProjectUserOption = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: "Planejamento",
  IN_PROGRESS: "Em andamento",
  ON_HOLD: "Pausado",
  COMPLETED: "Concluído",
  CANCELED: "Cancelado",
};

export const PROJECT_ACTIVITY_STATUS_LABELS: Record<ProjectActivityStatus, string> = {
  NOT_STARTED: "Não iniciada",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluída",
};

export const PROJECT_ACTIVITY_STATUS_STYLES: Record<ProjectActivityStatus, string> = {
  NOT_STARTED: "bg-muted text-muted-foreground",
  IN_PROGRESS: "bg-primary/15 text-primary",
  COMPLETED: "bg-emerald-500/15 text-emerald-500",
};

async function parseError(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  const apiMessage = data?.message
    ? Array.isArray(data.message)
      ? data.message[0]
      : data.message
    : null;
  return apiMessage || fallback;
}

export const projetosService = {
  async listCompanies() {
    const data = await apiRequest<ProjectCompany[] | null>("/projetos/companies");
    return Array.isArray(data) ? data : [];
  },

  async listProjects(companyId: string) {
    const data = await apiRequest<{
      company: { id: string; name: string } | null;
      projects: ProjectSummary[] | null;
    } | null>(`/projetos/companies/${companyId}/projects`);
    return {
      company: data?.company ?? { id: companyId, name: "" },
      projects: Array.isArray(data?.projects) ? data.projects : [],
    };
  },

  getProject(projectId: string) {
    return apiRequest<ProjectDetail>(`/projetos/projects/${projectId}`);
  },

  async createProject(
    companyId: string,
    data: {
      name: string;
      description?: string;
      status?: ProjectStatus;
      startDate?: string;
      endDate?: string;
      budgetUnit: ProjectBudgetUnit;
      budgetAmount: number;
      ticketNumber: number;
    },
    files?: File[],
  ) {
    if (files?.length) {
      const form = new FormData();
      form.append(
        "payload",
        JSON.stringify({
          name: data.name,
          description: data.description,
          status: data.status,
          startDate: data.startDate,
          endDate: data.endDate,
          budgetUnit: data.budgetUnit,
          budgetAmount: data.budgetAmount,
          ticketNumber: data.ticketNumber,
        }),
      );
      for (const file of files) {
        form.append("files", file);
      }
      const response = await authFetch(
        `${API_URL}/projetos/companies/${companyId}/projects`,
        { method: "POST", body: form },
      );
      if (!response.ok) {
        throw new Error(await parseError(response, "Falha ao criar projeto."));
      }
      return response.json() as Promise<ProjectDetail>;
    }

    return apiRequest<ProjectDetail>(`/projetos/companies/${companyId}/projects`, {
      method: "POST",
      body: data,
    });
  },

  updateProject(projectId: string, data: Partial<{
    name: string;
    description: string;
    status: ProjectStatus;
    startDate: string;
    endDate: string;
    budgetUnit: ProjectBudgetUnit;
    budgetAmount: number;
    ticketNumber: number;
  }>) {
    return apiRequest<ProjectDetail>(`/projetos/projects/${projectId}`, {
      method: "PATCH",
      body: data,
    });
  },

  deleteProject(projectId: string) {
    return apiRequest<{ ok: boolean }>(`/projetos/projects/${projectId}`, {
      method: "DELETE",
    });
  },

  createPhase(projectId: string, data: { name: string; notes?: string }) {
    return apiRequest<ProjectDetail>(`/projetos/projects/${projectId}/phases`, {
      method: "POST",
      body: data,
    });
  },

  getProjectHistory(projectId: string) {
    return apiRequest<ProjectHistoryEntry[]>(
      `/projetos/projects/${projectId}/history`,
    );
  },

  async exportProjectHistoryPdf(projectId: string) {
    const response = await authFetch(
      `${API_URL}/projetos/projects/${projectId}/history/pdf`,
    );
    if (!response.ok) {
      throw new Error(await parseError(response, "Falha ao exportar PDF."));
    }
    const meta = await readBlobDownload(response, "historico-projeto.pdf");
    triggerBrowserDownload(meta.blob, meta.filename);
  },

  reopenProject(projectId: string) {
    return apiRequest<ProjectDetail>(`/projetos/projects/${projectId}/reopen`, {
      method: "POST",
    });
  },

  listProjectTicketAppointments(projectId: string) {
    return apiRequest<{
      ticketNumber: number | null;
      appointments: ProjectTicketAppointment[];
    }>(`/projetos/projects/${projectId}/ticket-appointments`);
  },

  linkActivityAppointment(activityId: string, portalAppointmentId: string) {
    return apiRequest<ProjectDetail>(
      `/projetos/activities/${activityId}/appointments/link`,
      { method: "POST", body: { portalAppointmentId } },
    );
  },

  unlinkActivityAppointment(linkId: string) {
    return apiRequest<ProjectDetail>(`/projetos/appointments/links/${linkId}`, {
      method: "DELETE",
    });
  },

  createActivity(projectId: string, data: {
    parentId: string;
    name: string;
    durationHours?: number;
    durationDays?: number;
    startDate?: string;
    endDate?: string;
    actualDurationDays?: number;
    actualDurationHours?: number;
    progressPercent?: number;
    assigneeUserId?: string;
    assigneeName?: string;
    isMilestone?: boolean;
    notes?: string;
    predecessorIds: string[];
  }) {
    return apiRequest<ProjectDetail>(`/projetos/projects/${projectId}/activities`, {
      method: "POST",
      body: data,
    });
  },

  completeActivity(activityId: string, completed: boolean) {
    return apiRequest<ProjectDetail>(`/projetos/activities/${activityId}/complete`, {
      method: "POST",
      body: { completed },
    });
  },

  updateActivity(activityId: string, data: Partial<{
    name: string;
    durationHours: number;
    durationDays: number;
    startDate: string;
    endDate: string;
    actualDurationDays: number;
    actualDurationHours: number;
    progressPercent: number;
    assigneeUserId: string | null;
    assigneeName: string | null;
    isMilestone: boolean;
    notes: string | null;
    predecessorIds: string[];
  }>) {
    return apiRequest<ProjectDetail>(`/projetos/activities/${activityId}`, {
      method: "PATCH",
      body: data,
    });
  },

  deleteActivity(activityId: string) {
    return apiRequest<ProjectDetail>(`/projetos/activities/${activityId}`, {
      method: "DELETE",
    });
  },

  async searchUsers(params: { q?: string; companyId?: string }) {
    const qs = new URLSearchParams();
    if (params.q?.trim()) qs.set("q", params.q.trim());
    if (params.companyId) qs.set("companyId", params.companyId);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const data = await apiRequest<ProjectUserOption[] | null>(
      `/projetos/users/search${suffix}`,
    );
    return Array.isArray(data) ? data : [];
  },

  async approveProjectCompletion(projectId: string, note?: string) {
    return apiRequest<ProjectDetail>(
      `/projetos/projects/${projectId}/approve-completion`,
      { method: "POST", body: { note } },
    );
  },

  async addProjectDocuments(projectId: string, files: File[]) {
    const form = new FormData();
    for (const file of files) {
      form.append("files", file);
    }
    const response = await authFetch(
      `${API_URL}/projetos/projects/${projectId}/documents`,
      { method: "POST", body: form },
    );
    if (!response.ok) {
      throw new Error(await parseError(response, "Falha ao anexar documentos."));
    }
    return response.json() as Promise<ProjectDetail>;
  },

  async downloadProjectDocument(projectId: string, documentId: string) {
    const response = await authFetch(
      `${API_URL}/projetos/projects/${projectId}/documents/${documentId}`,
    );
    if (!response.ok) {
      throw new Error(await parseError(response, "Falha ao baixar documento."));
    }
    const meta = await readBlobDownload(response, "documento");
    triggerBrowserDownload(meta.blob, meta.filename);
  },

  async exportProject(projectId: string, template = false) {
    const qs = template ? "?template=true" : "";
    const response = await authFetch(
      `${API_URL}/projetos/projects/${projectId}/export${qs}`,
    );
    if (!response.ok) {
      throw new Error(await parseError(response, "Falha ao exportar planilha."));
    }
    const meta = await readBlobDownload(
      response,
      template ? "modelo-projeto.xlsx" : "projeto.xlsx",
    );
    triggerBrowserDownload(meta.blob, meta.filename);
  },

  async downloadImportTemplate() {
    const response = await authFetch(`${API_URL}/projetos/import-template`);
    if (!response.ok) {
      throw new Error(await parseError(response, "Falha ao baixar modelo."));
    }
    const meta = await readBlobDownload(response, "modelo-projeto.xlsx");
    triggerBrowserDownload(meta.blob, meta.filename);
  },

  async importProject(projectId: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    const response = await authFetch(
      `${API_URL}/projetos/projects/${projectId}/import`,
      { method: "POST", body: form },
    );
    if (!response.ok) {
      throw new Error(await parseError(response, "Falha ao importar planilha."));
    }
    return response.json() as Promise<{
      created: number;
      updated: number;
      errors: Array<{ row: number; message: string }>;
      project: ProjectDetail;
    }>;
  },
};

export function flattenProjectActivities(
  nodes: ProjectActivity[],
): ProjectActivity[] {
  const result: ProjectActivity[] = [];
  const walk = (items: ProjectActivity[]) => {
    for (const item of items) {
      result.push(item);
      if (item.children?.length) walk(item.children);
    }
  };
  walk(Array.isArray(nodes) ? nodes : []);
  return result;
}
