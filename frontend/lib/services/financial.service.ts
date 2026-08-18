import { apiRequest } from "@/lib/api";
import { isValidCompanyUuid } from "@/lib/selected-company";
import { parseContentDispositionFilename } from "@/lib/download-blob";
import { authFetch } from "@/lib/auth-fetch";
import { API_URL } from "@/lib/env";
import type { ListCompanyContractsResponse } from "@/lib/services/company-contracts.service";

export type FinancialOverviewContract = {
  id: string;
  title: string;
  status: "ACTIVE" | "INACTIVE" | "EXPIRED";
  monthlyHours: number;
  extraHourPrice: number;
  startDate: string;
  endDate: string | null;
  documentsCount: number;
  contractFile: null | {
    fileId: string;
    originalName: string;
  };
  latestBilling: null | {
    id: string;
    monthReference: string;
    contractedHours: number;
    usedHours: number;
    extraHours: number;
    extraAmount: number;
  };
};

export type FinancialOverviewResponse = {
  company: { id: string; name: string };
  totals: {
    contractedHours: number;
    usedHours: number;
    extraHours: number;
    extraAmount: number;
    extraHourPrice: number | null;
  };
  contracts: FinancialOverviewContract[];
};

export const financialService = {
  async listContracts(params: { companyId?: string }) {
    const search = new URLSearchParams();
    if (isValidCompanyUuid(params.companyId)) {
      search.set("companyId", params.companyId);
    }
    const qs = search.toString();
    return apiRequest<ListCompanyContractsResponse>(
      `/financial/contracts${qs ? `?${qs}` : ""}`,
    );
  },

  async overview(params: { companyId?: string }) {
    const search = new URLSearchParams();
    if (isValidCompanyUuid(params.companyId)) {
      search.set("companyId", params.companyId);
    }
    const qs = search.toString();
    return apiRequest<FinancialOverviewResponse>(`/financial/overview${qs ? `?${qs}` : ""}`);
  },

  async downloadContractFile(params: { contractId: string; companyId?: string; inline?: boolean }) {
    const search = new URLSearchParams();
    if (isValidCompanyUuid(params.companyId)) {
      search.set("companyId", params.companyId);
    }
    if (params.inline) search.set("inline", "true");
    const qs = search.toString();
    const url = `${API_URL}/financial/contracts/${params.contractId}/file${qs ? `?${qs}` : ""}`;

    const res = await authFetch(url, {
      method: "GET",
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(msg || `Erro ao baixar arquivo (${res.status}).`);
    }

    const blob = await res.blob();
    const cd = res.headers.get("content-disposition") ?? "";
    const filename = parseContentDispositionFilename(cd, "contrato.pdf");
    return { blob, filename };
  },
};

