import { apiRequest } from "@/lib/api";
import { isValidCompanyUuid } from "@/lib/selected-company";

export type ContractStatus = "ACTIVE" | "INACTIVE" | "EXPIRED";

export type ContractFile = {
  id: string;
  contractId: string;
  fileId: string;
  type: "CONTRACT" | string;
  file: {
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
    createdAt: string;
  };
};

export type ContractClassification = {
  id: string;
  name: string;
  level: number;
  specialty?: { id: string; name: string } | null;
  serviceDesk?: { id: string; name: string } | null;
  parent?: ContractClassification | null;
};

export type ContractSpecialtyLine = {
  id: string;
  specialtyId: string;
  monthlyHours: number;
  unlimited: boolean;
  contractValue: string;
  excessHourPrice: string;
  specialty?: { id: string; name: string; externalId?: number | null } | null;
};

export type CompanyContract = {
  id: string;
  companyId: string;
  classificationId?: string | null;
  classification?: ContractClassification | null;
  title: string;
  description: string | null;
  status: ContractStatus;
  /** @deprecated Prefer specialties[].monthlyHours */
  monthlyHours: number;
  /** @deprecated Prefer specialties[].excessHourPrice */
  extraHourPrice: string;
  startDate: string;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  specialties?: ContractSpecialtyLine[];
  contractFiles?: ContractFile[];
};

export type ListCompanyContractsResponse = {
  company: { id: string; name: string };
  contracts: CompanyContract[];
};

export type ContractSpecialtyLinePayload = {
  specialtyId: string;
  monthlyHours: number;
  unlimited?: boolean;
  contractValue: string;
  excessHourPrice: string;
};

export type CreateCompanyContractPayload = {
  title: string;
  description?: string;
  status: ContractStatus;
  startDate: string;
  endDate?: string | null;
  specialties: ContractSpecialtyLinePayload[];
  /** Legado — preenchido a partir da 1ª linha */
  monthlyHours?: number;
  extraHourPrice?: string;
  classificationId?: string | null;
};

export type UpdateCompanyContractPayload = Partial<CreateCompanyContractPayload>;

export const companyContractsService = {
  async list(companyId: string) {
    if (!isValidCompanyUuid(companyId)) {
      throw new Error("Selecione uma empresa válida.");
    }
    return apiRequest<ListCompanyContractsResponse>(`/companies/${companyId}/contracts`);
  },

  async create(companyId: string, payload: CreateCompanyContractPayload) {
    return apiRequest<CompanyContract>(`/companies/${companyId}/contracts`, {
      method: "POST",
      body: payload,
    });
  },

  async update(companyId: string, contractId: string, payload: UpdateCompanyContractPayload) {
    return apiRequest<CompanyContract>(`/companies/${companyId}/contracts/${contractId}`, {
      method: "PATCH",
      body: payload,
    });
  },

  async remove(companyId: string, contractId: string) {
    return apiRequest<{ id: string }>(`/companies/${companyId}/contracts/${contractId}`, {
      method: "DELETE",
    });
  },

  async uploadFile(companyId: string, contractId: string, file: File) {
    const form = new FormData();
    form.set("file", file);
    return apiRequest<ContractFile>(`/companies/${companyId}/contracts/${contractId}/file`, {
      method: "POST",
      body: form,
    });
  },
};
