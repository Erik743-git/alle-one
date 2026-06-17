import type { MonthlyDeskBreakdownRow } from './desk-categories';

export type MonthlyTicketRow = MonthlyDeskBreakdownRow;
export type MonthlyHoursRow = MonthlyDeskBreakdownRow;

export type MonthlyAlertsRow = {
  monthKey: string;
  monthLabel: string;
  High: number;
  Disaster: number;
  Total: number;
};

export type WeeklyAlertsRow = {
  weekKey: string;
  weekLabel: string;
  High: number;
  Disaster: number;
  Total: number;
};

export type TopHostsByMonthRow = {
  monthKey: string;
  monthLabel: string;
  High: Array<{ host: string; quantity: number }>;
  Disaster: Array<{ host: string; quantity: number }>;
};

export type TopTriggerRow = {
  host: string;
  trigger: string;
  severity: 'High' | 'Disaster';
  count: number;
};

export type AppointmentLike = {
  date?: string;
  init_time?: string;
  end_time?: string;
  description?: string;
  client?: { id: number; name: string } | null;
  user?: { id: number; name: string } | null;
  valorization?: unknown;
  [key: string]: unknown;
};

export type DashboardFilters = {
  group: string;
  start?: string;
  end?: string;
  companyId?: string;
};

export type DashboardSummary = {
  totalChamados: number;
  totalTickets: number;
  totalOpenTickets: number;
  totalHoras: number;
  totalHorasFormatadas?: string;
  totalHigh: number;
  totalDisaster: number;
  totalTriggersDistintos: number;
  totalHosts: number;
  hostsAtivos: number;
  hostsInativos: number;
};

export type WorkHoursTifluxAssistanceBucket =
  | 'externo'
  | 'remoto'
  | 'interno'
  | 'sem';

export type WorkHoursTifluxLine = {
  data: string;
  horaInicio: string;
  horaFim: string;
  duracaoFormatada: string;
  assistencia: string;
  assistenciaBucket: WorkHoursTifluxAssistanceBucket;
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

export type DashboardMonthlyTrendMetric = {
  currentMonthLabel: string;
  previousMonthLabel: string;
  currentValue: number;
  previousValue: number;
  currentValueFormatted?: string;
  delta: number;
  deltaPercent: number;
  direction: 'up' | 'down' | 'flat';
};

export type DashboardMonthlyTrends = {
  horasTrabalhadas: DashboardMonthlyTrendMetric;
  alertas: DashboardMonthlyTrendMetric;
};

export type DashboardResponse = {
  filters: {
    group: string;
    start: string;
    end: string;
    companyId: string | null;
  };
  summary: DashboardSummary;
  chamadosPorMes: MonthlyTicketRow[];
  chamadosPorMesa: Array<{ deskName: string; totalTickets: number }>;
  horasPorMes: MonthlyHoursRow[];
  resumoHorasTrabalhadas: WorkHoursTifluxSummary | null;
  alertasPorMes: MonthlyAlertsRow[];
  alertasPorSemana: WeeklyAlertsRow[];
  principaisHostsPorMes: TopHostsByMonthRow[];
  topTriggers: TopTriggerRow[];
  allTriggersInPeriod: TopTriggerRow[];
  hostsDetalhados: unknown[];
  templates: unknown[];
  eventosRecentes: unknown[];
  monthlyTrends?: DashboardMonthlyTrends | null;
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
    totalHorasFormatadas: string;
    totalTicketsConsiderados: number;
  };
  horasPorMes: MonthlyHoursRow[];
  horasPorMesa: Array<{
    deskName: string;
    totalMinutes: number;
    totalHorasFormatadas: string;
  }>;
  resumoHorasTrabalhadas: WorkHoursTifluxSummary | null;
};

export type ResolvedCompanyIntegration = {
  zabbixGroupName: string;
  tifluxClientId: number | null;
};
