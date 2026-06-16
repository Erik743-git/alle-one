export type ZabbixOverview = {
  group: string;
  totalHosts: number;
  hostsAtivos: number;
  hostsInativos: number;
  problemasAbertos: number;
  problemasAlta: number;
  problemasMedia: number;
};

export type ZabbixDashboardDetails = {
  overview: ZabbixOverview;
  hosts: unknown[];
  templates: unknown[];
  events: Array<Record<string, unknown>>;
  resumo: {
    totalTemplates: number;
    totalEventos: number;
    eventosProblema: number;
    eventosRecuperacao: number;
    eventosCriticos: number;
    eventosMedios: number;
  };
  periodo: { dias: number; de?: number; ate?: number };
};
