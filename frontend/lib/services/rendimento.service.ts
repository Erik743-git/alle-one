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

export const rendimentoService = {
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
};
