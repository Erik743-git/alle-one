import { apiRequest } from "@/lib/api";

export type RendimentoCalendarView = "month" | "week" | "day";

export type RendimentoCollaborator = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "COLLABORATOR" | "PJ" | "CLIENT";
  companyName: string | null;
  status: string;
  tifluxUserId: number | null;
  tifluxUserName: string | null;
  monthTotalMinutes: number;
  monthTotalHoursFormatted: string;
};

export type RendimentoGap = {
  type: "idle" | "lunch";
  fromTime: string;
  toTime: string;
  gapMinutes: number;
  label: string;
  justification?: {
    id: string;
    kind: "ALERT" | "VOLUNTARY";
    status: "PENDING" | "APPROVED" | "REJECTED";
    gapType?: "idle" | "lunch";
    reason: string;
    debitOvertime: boolean;
    overtimeMinutes: number;
    createdBy: string;
    createdAt: string;
    approvedBy: string | null;
    approvedAt: string | null;
  };
};

export type RendimentoDayInsights = {
  regularMinutes: number;
  overtimeMinutes: number;
  hasOvertime: boolean;
  hasIdleGapAlert: boolean;
  hasExpectedLunch: boolean;
  gaps: RendimentoGap[];
};

export type RendimentoEntry = {
  id: number;
  date: string;
  initTime: string | null;
  endTime: string | null;
  minutes: number;
  hoursFormatted: string;
  ticketNumber: number;
  clientName: string | null;
  description: string | null;
  isOvertime: boolean;
  overtimeKind?: "EXTRA" | "PLANTAO" | null;
  valorizationServiceName?: string | null;
  dayEventId?: string | null;
  dayEventStatus?: "ACTIVE" | "PENDING" | "APPROVED" | "REJECTED" | null;
  debitProtected?: boolean;
};

export type RendimentoVoluntaryJustification = {
  id: string;
  kind: "VOLUNTARY";
  status: "PENDING" | "APPROVED" | "REJECTED";
  gapType?: "idle" | "lunch";
  fromTime: string;
  toTime: string;
  gapMinutes: number;
  reason: string;
  debitOvertime: boolean;
  overtimeMinutes: number;
  createdBy: string;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
};

export type RendimentoDaySummary = {
  date: string;
  totalMinutes: number;
  totalHoursFormatted: string;
  entries: RendimentoEntry[];
  insights: RendimentoDayInsights;
  voluntaryJustifications?: RendimentoVoluntaryJustification[];
};

export type RendimentoTimesheet = {
  userId: string;
  userName: string;
  view: RendimentoCalendarView;
  referenceDate: string;
  rangeStart: string;
  rangeEnd: string;
  totalMinutes: number;
  totalHoursFormatted: string;
  periodOvertimeMinutes: number;
  periodOvertimeFormatted: string;
  periodOvertimeRangeLabel: string;
  periodPlantaoMinutes: number;
  periodPlantaoFormatted: string;
  overtimeBalanceMinutes: number;
  overtimeBalanceFormatted: string;
  days: RendimentoDaySummary[];
};

export type RendimentoCompany = {
  id: string;
  name: string;
  tifluxClientId: number | null;
  tifluxClientName: string | null;
  monthTotalMinutes: number;
  monthTotalHoursFormatted: string;
  pendingQuestionsCount: number;
};

export type RendimentoAppointmentQuestion = {
  id: string;
  status: "PENDING" | "ANSWERED";
  message: string;
  adminResponse: string | null;
  adminResponseCode: string | null;
  abonado: boolean;
  createdAt: string;
  respondedAt: string | null;
};

export type CompanyQuestionItem = {
  id: string;
  appointmentSource: "tiflux" | "portal";
  appointmentRef: string;
  ticketNumber: number;
  appointmentDate: string;
  initTime: string | null;
  endTime: string | null;
  userName: string | null;
  description: string | null;
  message: string;
  questionedByName: string;
  createdAt: string;
  status: "PENDING" | "ANSWERED";
  adminResponse: string | null;
  abonado: boolean;
  respondedAt: string | null;
};

export type RendimentoCompanyAppointment = {
  source: "tiflux" | "portal";
  ref: string;
  ticketNumber: number;
  date: string;
  initTime: string | null;
  endTime: string | null;
  minutes: number;
  hoursFormatted: string;
  userName: string | null;
  description: string | null;
  descriptionFull?: string | null;
  descriptionTruncated?: boolean;
  serviceName: string | null;
  question: RendimentoAppointmentQuestion | null;
};

export type RendimentoCompanyDay = {
  date: string;
  totalMinutes: number;
  totalHoursFormatted: string;
  appointmentCount: number;
  pendingQuestions: number;
  entries: RendimentoCompanyAppointment[];
};

export type RendimentoCompanyAgenda = {
  company: RendimentoCompany;
  date: string;
  view: "month" | "week" | "day";
  rangeStart: string;
  rangeEnd: string;
  totalMinutes: number;
  totalHoursFormatted: string;
  totalAppointments: number;
  totalPendingQuestions: number;
  days: RendimentoCompanyDay[];
};

export const rendimentoService = {
  listCompanies() {
    return apiRequest<RendimentoCompany[]>("/rendimento/companies");
  },

  listCompanyQuestions(params: {
    companyId: string;
    status?: "PENDING" | "ANSWERED";
  }) {
    const search = new URLSearchParams();
    if (params.status) search.set("status", params.status);
    const qs = search.toString();
    return apiRequest<CompanyQuestionItem[]>(
      `/rendimento/companies/${params.companyId}/questions${qs ? `?${qs}` : ""}`,
    );
  },

  getCompanyAgenda(params: {
    companyId: string;
    view: "month" | "week" | "day";
    date?: string;
  }) {
    const search = new URLSearchParams();
    search.set("view", params.view);
    if (params.date) {
      search.set("date", params.date);
    }
    return apiRequest<RendimentoCompanyAgenda>(
      `/rendimento/companies/${params.companyId}/agenda?${search.toString()}`,
    );
  },

  createAppointmentQuestion(params: {
    companyId: string;
    appointmentSource: "tiflux" | "portal";
    appointmentRef: string;
    ticketNumber: number;
    date: string;
    initTime?: string;
    endTime?: string;
    userName?: string;
    description?: string;
    message: string;
  }) {
    const { companyId, ...body } = params;
    return apiRequest<{ ok: boolean; question: RendimentoAppointmentQuestion }>(
      `/rendimento/companies/${companyId}/questions`,
      { method: "POST", body },
    );
  },

  answerAppointmentQuestion(params: {
    id: string;
    responseNote: string;
    abonar?: boolean;
    responseCode?: string;
  }) {
    return apiRequest<{ ok: boolean; question: RendimentoAppointmentQuestion }>(
      `/rendimento/questions/${params.id}/answer`,
      {
        method: "PATCH",
        body: {
          responseNote: params.responseNote,
          abonar: params.abonar,
          responseCode: params.responseCode,
        },
      },
    );
  },

  listCollaborators() {
    return apiRequest<RendimentoCollaborator[]>("/rendimento/collaborators");
  },

  getTimesheet(params: {
    userId: string;
    view: RendimentoCalendarView;
    date?: string;
  }) {
    const search = new URLSearchParams();
    search.set("view", params.view);
    if (params.date) {
      search.set("date", params.date);
    }
    return apiRequest<RendimentoTimesheet>(
      `/rendimento/users/${params.userId}/timesheet?${search.toString()}`,
    );
  },

  createJustification(params: {
    userId: string;
    date: string;
    fromTime: string;
    toTime: string;
    gapType: "idle" | "lunch";
    gapMinutes: number;
    kind: "ALERT" | "VOLUNTARY";
    reason: string;
    debitOvertime?: boolean;
    overtimeMinutes?: number;
  }) {
    return apiRequest<{ id: string; status: "PENDING" }>(
      `/rendimento/users/${params.userId}/justifications`,
      {
        method: "POST",
        // `userId` vai na URL. Se vier no body o backend rejeita (whitelist + forbidNonWhitelisted).
        body: (({ userId: _userId, ...body }) => body)(params),
      },
    );
  },

  decideJustification(params: {
    id: string;
    decision: "APPROVED" | "REJECTED";
    note?: string;
  }) {
    return apiRequest<{ id: string; status: "APPROVED" | "REJECTED" }>(
      `/rendimento/justifications/${params.id}/decision`,
      {
        method: "PATCH",
        body: {
          decision: params.decision,
          note: params.note,
        },
      },
    );
  },

  decideDayEvent(params: {
    id: string;
    decision: "APPROVED" | "REJECTED";
  }) {
    return apiRequest<{
      id: string;
      status: "APPROVED" | "REJECTED";
      debitProtected: boolean;
    }>(`/rendimento/events/${params.id}/decision`, {
      method: "PATCH",
      body: { decision: params.decision },
    });
  },

  listPendingOvertime(params: {
    start: string;
    end: string;
    userId?: string;
  }) {
    const search = new URLSearchParams();
    search.set("start", params.start);
    search.set("end", params.end);
    if (params.userId) search.set("userId", params.userId);
    return apiRequest<PendingOvertimeItem[]>(
      `/rendimento/overtime/pending?${search.toString()}`,
    );
  },

  listPendingJustifications(params: {
    start: string;
    end: string;
    userId?: string;
  }) {
    const search = new URLSearchParams();
    search.set("start", params.start);
    search.set("end", params.end);
    if (params.userId) search.set("userId", params.userId);
    return apiRequest<PendingJustificationItem[]>(
      `/rendimento/justifications/pending?${search.toString()}`,
    );
  },

  bulkDecideJustifications(params: {
    ids: string[];
    decision: "APPROVED" | "REJECTED";
    note?: string;
  }) {
    return apiRequest<BulkDecideDayEventsResult>(
      "/rendimento/justifications/bulk-decision",
      {
        method: "PATCH",
        body: params,
      },
    );
  },

  bulkDecideDayEvents(params: {
    ids: string[];
    decision: "APPROVED" | "REJECTED";
  }) {
    return apiRequest<BulkDecideDayEventsResult>(
      "/rendimento/events/bulk-decision",
      {
        method: "PATCH",
        body: params,
      },
    );
  },
};

export type PendingJustificationItem = {
  id: string;
  userId: string;
  userEmail: string;
  date: string;
  fromTime: string | null;
  toTime: string | null;
  gapType: "idle" | "lunch";
  gapTypeLabel: string;
  gapMinutes: number;
  gapLabel: string;
  kind: "ALERT" | "VOLUNTARY";
  kindLabel: string;
  reason: string;
  debitOvertime: boolean;
  overtimeMinutes: number;
  overtimeFormatted: string;
  companyName: string | null;
};

export type PendingOvertimeItem = {
  id: string;
  userId: string;
  userEmail: string;
  date: string;
  eventType: "OVERTIME" | "PLANTAO";
  typeLabel: string;
  fromTime: string | null;
  toTime: string | null;
  minutes: number;
  hoursFormatted: string;
  label: string | null;
  description: string | null;
  appointmentExternalId: number | null;
  companyName: string | null;
  ticketNumber: number | null;
};

export type BulkDecideDayEventsResult = {
  decision: "APPROVED" | "REJECTED";
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{
    id: string;
    ok: boolean;
    status?: "APPROVED" | "REJECTED";
    error?: string;
  }>;
};
