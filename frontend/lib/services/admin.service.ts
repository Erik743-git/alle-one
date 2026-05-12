import { apiRequest } from "@/lib/api";

export type AdminOverviewStats = {
  companiesActive: number;
  companiesTotal: number;
  usersActive: number;
  adminUsers: number;
  contractFilesCount: number;
};

export const adminService = {
  async overviewStats() {
    return apiRequest<AdminOverviewStats>("/admin/overview-stats");
  },
};
