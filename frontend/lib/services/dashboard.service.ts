import { apiRequest } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import { API_URL } from "@/lib/env";

export type DashboardSummary = {
  totalChamados: number;
  totalTickets: number;
  totalOpenTickets: number;
  totalHoras: number;
  totalHorasFormatadas?: string;
  totalHigh: number;
  totalDisaster: number;
  totalTriggersDistintos?: number;
  totalHosts: number;
  hostsAtivos: number;
  hostsInativos: number;
};

export type DashboardChamadosMes = {
  monthKey: string;
  monthLabel: string;
  Infraestrutura: number;
  Sistema: number;
  NOC: number;
  Rotinas: number;
  Consult: number;
  Total: number;
};

export type DashboardHorasMes = {
  monthKey: string;
  monthLabel: string;
  Infraestrutura: number;
  Sistema: number;
  NOC: number;
  Rotinas: number;
  Consult: number;
  Total: number;
};

export type WorkHoursTifluxLine = {
  data: string;
  horaInicio: string;
  horaFim: string;
  duracaoFormatada: string;
  assistencia: string;
  assistenciaBucket: "externo" | "remoto" | "interno" | "sem";
  ticketNumber: number;
  titulo: string;
  atendente: string;
};

export type WorkHoursTifluxSummary = {
  totalTicketsDistintos: number;
  totalMinutos: number;
  totalHorasFormatadas: string;
  semAssistenciaMinutos: number;
  semAssistenciaFormatado: string;
  externoMinutos: number;
  externoFormatado: string;
  remotoMinutos: number;
  remotoFormatado: string;
  internoMinutos: number;
  internoFormatado: string;
  totalApontamentosNoPeriodo: number;
  limiteLinhas: number;
  linhas: WorkHoursTifluxLine[];
  linhasTruncadas: boolean;
};

export type DashboardAlertasMes = {
  monthKey: string;
  monthLabel: string;
  High: number;
  Disaster: number;
  Total: number;
};

export type DashboardAlertasSemana = {
  weekKey: string;
  weekLabel: string;
  High: number;
  Disaster: number;
  Total: number;
};

export type DashboardTopHostItem = {
  host: string;
  quantity: number;
};

export type DashboardTopHostsMes = {
  monthKey: string;
  monthLabel: string;
  High: DashboardTopHostItem[];
  Disaster: DashboardTopHostItem[];
};

export type DashboardTopTrigger = {
  host: string;
  trigger: string;
  severity: "High" | "Disaster";
  count: number;
};

export type DashboardCompleteResponse = {
  filters: {
    group: string;
    start: string;
    end: string;
    companyId: string | null;
  };
  summary: DashboardSummary;
  chamadosPorMes: DashboardChamadosMes[];
  horasPorMes: DashboardHorasMes[];
  alertasPorMes: DashboardAlertasMes[];
  alertasPorSemana?: DashboardAlertasSemana[];
  principaisHostsPorMes: DashboardTopHostsMes[];
  topTriggers: DashboardTopTrigger[];
  allTriggersInPeriod?: DashboardTopTrigger[];
  hostsDetalhados: unknown[];
  templates: unknown[];
  eventosRecentes: unknown[];
  /** Resumo estilo TiFlux (apontamentos no período). */
  resumoHorasTrabalhadas?: WorkHoursTifluxSummary | null;
};

export type DashboardHoursResponse = {
  filters: {
    group: string;
    start: string;
    end: string;
    companyId: string | null;
  };
  summary: {
    totalHoras: number;
    totalHorasFormatadas?: string;
    totalTicketsConsiderados: number;
  };
  horasPorMes: DashboardHorasMes[];
  resumoHorasTrabalhadas?: WorkHoursTifluxSummary | null;
};

export type DashboardRequestParams = {
  group: string;
  start?: string;
  end?: string;
  companyId?: string | number | null;
};

function buildDashboardSearch(params: DashboardRequestParams) {
  const search = new URLSearchParams();

  search.set("group", params.group);

  if (params.start) {
    search.set("start", params.start);
  }

  if (params.end) {
    search.set("end", params.end);
  }

  if (params.companyId !== undefined && params.companyId !== null) {
    search.set("companyId", String(params.companyId));
  }

  return search.toString();
}

export function getCompleteDashboard(params: DashboardRequestParams) {
  const query = buildDashboardSearch(params);

  return apiRequest<DashboardCompleteResponse>(`/dashboard/complete?${query}&includeHours=true`);
}

export function getDashboardHours(params: DashboardRequestParams) {
  const query = buildDashboardSearch(params);

  return apiRequest<DashboardHoursResponse>(`/dashboard/hours?${query}`);
}

export function refreshCompleteDashboard(params: DashboardRequestParams) {
  const query = buildDashboardSearch(params);

  return apiRequest<DashboardCompleteResponse>(
    `/dashboard/complete-refresh?${query}`,
  );
}

/** Somente desenvolvimento local com ENABLE_DEBUG_DUMP=true no backend. */
export async function downloadDebugDump(params: {
  group?: string;
  companyId: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}) {
  const search = new URLSearchParams();
  // Para o dump, o companyId é o mais importante. group pode ser um placeholder.
  search.set("group", params.group?.trim() ? params.group.trim() : "AUTO");
  search.set("companyId", params.companyId);
  search.set("start", params.start);
  search.set("end", params.end);

  const res = await authFetch(`${API_URL}/dashboard/debug-dump?${search.toString()}`, {
    method: "GET",
  });

  if (res.status === 401) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Falha ao baixar dump (${res.status}).`);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") ?? "";
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
  const filename = filenameMatch?.[1]
    ? decodeURIComponent(filenameMatch[1])
    : `debug-dump-${Date.now()}.txt`;

  return { blob, filename };
}