import { apiRequest } from "@/lib/api";
import { isValidCompanyUuid } from "@/lib/selected-company";

export type TifluxContractStatus = "actives" | "readjust" | "expired";

export type TifluxContract = {
  id: number;
  cancelled: boolean;
  client: { id: number; name: string };
  contract_type: { id: number; name: string };
  duration: number;
  expiration_date: string;
  modality: string;
  name: string;
  readjust_duration: number;
  readjustment_date: string;
  rider_tax: string | "--";
  rider_value: string | "--";
  status: TifluxContractStatus;
  total_value: string | "--";
};

export type ContractsResponse = {
  company: { id: string; name: string };
  meta: { offset: number; limit: number; totalItems: number | null };
  items: TifluxContract[];
};

export const contractsService = {
  async list(params: {
    companyId?: string;
    offset?: number;
    limit?: number;
    status?: TifluxContractStatus[]; // default: actives
  }) {
    const search = new URLSearchParams();
    if (isValidCompanyUuid(params.companyId)) {
      search.set("companyId", params.companyId);
    }
    if (params.offset) search.set("offset", String(params.offset));
    if (params.limit) search.set("limit", String(params.limit));
    if (params.status?.length) search.set("status", params.status.join(","));
    const qs = search.toString();
    return apiRequest<ContractsResponse>(`/contracts${qs ? `?${qs}` : ""}`);
  },
};

