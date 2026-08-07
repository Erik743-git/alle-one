import { apiRequest } from "@/lib/api";

export type DashboardClientViewMode = "ALLE" | "INTERNAL";
export type DashboardChartType = "bar" | "line" | "pie";
export type DashboardChartKey = "CHAMADOS" | "HORAS" | "ALERTAS";

export type DashboardChartPreset = {
  id: string;
  viewMode: DashboardClientViewMode;
  chartKey: DashboardChartKey;
  chartType: string;
  deskNames: string[];
  periodDays: number;
  updatedAt: string;
};

export const dashboardChartPresetsService = {
  get(
    viewMode: DashboardClientViewMode,
    chartKey: DashboardChartKey,
    companyId?: string | null,
  ) {
    const q = new URLSearchParams({ viewMode, chartKey });
    if (companyId) q.set("companyId", companyId);
    return apiRequest<DashboardChartPreset | null>(
      `/dashboard/chart-presets?${q.toString()}`,
    );
  },

  upsert(body: {
    viewMode: DashboardClientViewMode;
    chartKey: DashboardChartKey;
    chartType?: DashboardChartType | string;
    deskNames?: string[];
    periodDays?: number;
    companyId?: string | null;
  }) {
    const payload: Record<string, unknown> = {
      viewMode: body.viewMode,
      chartKey: body.chartKey,
      chartType: body.chartType,
      deskNames: body.deskNames ?? [],
      periodDays: body.periodDays,
    };
    if (body.companyId) {
      payload.companyId = body.companyId;
    }
    return apiRequest<DashboardChartPreset>("/dashboard/chart-presets", {
      method: "PUT",
      body: payload,
    });
  },
};
