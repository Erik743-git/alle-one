import { apiRequest } from "@/lib/api";

export type RendimentoCalendarView = "month" | "week" | "day";

export type RendimentoCollaborator = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "COLLABORATOR" | "CLIENT";
  companyName: string | null;
  status: string;
  tifluxUserId: number | null;
  tifluxUserName: string | null;
  monthTotalMinutes: number;
  monthTotalHoursFormatted: string;
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
};

export type RendimentoDaySummary = {
  date: string;
  totalMinutes: number;
  totalHoursFormatted: string;
  entries: RendimentoEntry[];
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
};
