import { apiRequest } from "@/lib/api";

export type DashboardClientViewMode = "ALLE" | "INTERNAL";
export type DashboardChartType = "bar" | "line" | "pie";

export type DashboardChartPreset = {
  id: string;
  viewMode: DashboardClientViewMode;
  chartType: string;
  deskNames: string[];
  periodDays: number;
  updatedAt: string;
};

export const dashboardChartPresetsService = {
  get(viewMode: DashboardClientViewMode, companyId?: string | null) {
    const q = new URLSearchParams({ viewMode });
    if (companyId) q.set("companyId", companyId);
    return apiRequest<DashboardChartPreset | null>(
      `/dashboard/chart-presets?${q.toString()}`,
    );
  },

  upsert(body: {
    viewMode: DashboardClientViewMode;
    chartType?: DashboardChartType | string;
    deskNames?: string[];
    periodDays?: number;
    companyId?: string | null;
  }) {
    return apiRequest<DashboardChartPreset>("/dashboard/chart-presets", {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
};
