import { apiRequest } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import { readBlobDownload } from "@/lib/download-blob";
import { API_URL } from "@/lib/env";

export type InventoryCompany = {
  id: string;
  name: string;
  assetsCount: number;
  expiredCount: number;
};

export type InventoryAssetTypeOverview = {
  id: string;
  name: string;
  assetsCount: number;
  expiredCount: number;
  companiesCount: number;
};

export type InventoryAssetType = {
  id: string;
  name: string;
};

export type InventoryAssetFile = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
};

export type InventoryAsset = {
  id: string;
  companyId: string;
  assetTypeId: string;
  assetTypeName: string;
  name: string;
  brand: string | null;
  quantity: number | null;
  supplier: string | null;
  supplierThirdParty: boolean;
  description: string | null;
  dueDate: string | null;
  reminderDaysBefore: number | null;
  file: InventoryAssetFile | null;
  createdAt: string;
  updatedAt: string;
};

export const INVENTORY_DEFAULT_SUPPLIER = "Alle Tecnologia";

export type InventoryAssetsResponse = {
  company: { id: string; name: string };
  assets: InventoryAsset[];
};

export type InventoryAssetWithCompany = InventoryAsset & {
  companyName: string;
};

export type InventoryAssetsByTypeResponse = {
  assetType: { id: string; name: string };
  assets: InventoryAssetWithCompany[];
};

export const INVENTORY_REMINDER_OPTIONS = [
  { value: "90", label: "90 dias antes" },
  { value: "30", label: "30 dias antes" },
  { value: "15", label: "15 dias antes" },
  { value: "7", label: "7 dias antes" },
] as const;

async function parseError(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  const apiMessage = data?.message
    ? Array.isArray(data.message)
      ? data.message[0]
      : data.message
    : null;
  if (apiMessage) return apiMessage;
  const text = await response.text().catch(() => "");
  return text || fallback;
}

function appendAssetFields(
  form: FormData,
  data: {
    assetTypeId: string;
    brand?: string;
    quantity?: string;
    supplierThirdParty?: boolean;
    supplier?: string;
    description?: string;
    dueDate?: string;
    reminderDaysBefore?: string;
    clearDueDate?: boolean;
    clearReminder?: boolean;
    removeAttachment?: boolean;
  },
) {
  form.append("assetTypeId", data.assetTypeId);
  if (data.brand !== undefined) form.append("brand", data.brand);
  if (data.quantity !== undefined) form.append("quantity", data.quantity);
  if (data.supplierThirdParty !== undefined) {
    form.append("supplierThirdParty", data.supplierThirdParty ? "true" : "false");
  }
  if (data.supplier !== undefined) form.append("supplier", data.supplier);
  if (data.description !== undefined) {
    form.append("description", data.description);
  }
  if (data.dueDate !== undefined) form.append("dueDate", data.dueDate);
  if (data.reminderDaysBefore !== undefined && data.reminderDaysBefore !== "") {
    form.append("reminderDaysBefore", data.reminderDaysBefore);
  }
  if (data.clearDueDate) form.append("clearDueDate", "true");
  if (data.clearReminder) form.append("clearReminder", "true");
  if (data.removeAttachment) form.append("removeAttachment", "true");
}

export const inventarioService = {
  listAssetTypes() {
    return apiRequest<InventoryAssetType[]>("/inventario/asset-types");
  },

  createAssetType(name: string) {
    return apiRequest<InventoryAssetType>("/inventario/asset-types", {
      method: "POST",
      body: { name: name.trim() },
    });
  },

  listCompanies() {
    return apiRequest<InventoryCompany[]>("/inventario/companies");
  },

  listAssetTypesOverview() {
    return apiRequest<InventoryAssetTypeOverview[]>(
      "/inventario/asset-types/overview",
    );
  },

  listAssetsByType(assetTypeId: string) {
    return apiRequest<InventoryAssetsByTypeResponse>(
      `/inventario/asset-types/${assetTypeId}/assets`,
    );
  },

  listAssets(companyId: string) {
    return apiRequest<InventoryAssetsResponse>(
      `/inventario/companies/${companyId}/assets`,
    );
  },

  async createAsset(
    companyId: string,
    data: {
      assetTypeId: string;
      brand?: string;
      quantity?: string;
      supplierThirdParty?: boolean;
      supplier?: string;
      description?: string;
      dueDate?: string;
      reminderDaysBefore?: string;
    },
    file?: File | null,
  ) {
    const form = new FormData();
    appendAssetFields(form, data);
    if (file) form.append("file", file);

    const response = await authFetch(
      `${API_URL}/inventario/companies/${companyId}/assets`,
      { method: "POST", body: form },
    );
    if (!response.ok) {
      throw new Error(await parseError(response, "Não foi possível criar o ativo."));
    }
    return (await response.json()) as InventoryAsset;
  },

  async updateAsset(
    assetId: string,
    data: {
      assetTypeId?: string;
      brand?: string;
      quantity?: string;
      supplierThirdParty?: boolean;
      supplier?: string;
      description?: string;
      dueDate?: string;
      reminderDaysBefore?: string;
      clearDueDate?: boolean;
      clearReminder?: boolean;
      removeAttachment?: boolean;
    },
    file?: File | null,
  ) {
    const form = new FormData();
    if (data.assetTypeId) form.append("assetTypeId", data.assetTypeId);
    if (data.brand !== undefined) form.append("brand", data.brand);
    if (data.quantity !== undefined) form.append("quantity", data.quantity);
    if (data.supplierThirdParty !== undefined) {
      form.append("supplierThirdParty", data.supplierThirdParty ? "true" : "false");
    }
    if (data.supplier !== undefined) form.append("supplier", data.supplier);
    if (data.description !== undefined) form.append("description", data.description);
    if (data.dueDate !== undefined) form.append("dueDate", data.dueDate);
    if (data.reminderDaysBefore !== undefined) {
      form.append("reminderDaysBefore", data.reminderDaysBefore);
    }
    if (data.clearDueDate) form.append("clearDueDate", "true");
    if (data.clearReminder) form.append("clearReminder", "true");
    if (data.removeAttachment) form.append("removeAttachment", "true");
    if (file) form.append("file", file);

    const response = await authFetch(`${API_URL}/inventario/assets/${assetId}`, {
      method: "PATCH",
      body: form,
    });
    if (!response.ok) {
      throw new Error(await parseError(response, "Não foi possível atualizar o ativo."));
    }
    return (await response.json()) as InventoryAsset;
  },

  deleteAsset(assetId: string) {
    return apiRequest<{ ok: boolean }>(`/inventario/assets/${assetId}`, {
      method: "DELETE",
    });
  },

  async fetchAttachment(params: {
    fileId: string;
    companyId: string;
    inline?: boolean;
  }) {
    const qs = new URLSearchParams({
      companyId: params.companyId,
      inline: params.inline === false ? "false" : "true",
    });
    const response = await authFetch(
      `${API_URL}/inventario/attachments/${params.fileId}?${qs}`,
    );
    if (!response.ok) {
      throw new Error(await parseError(response, "Não foi possível carregar o anexo."));
    }
    return readBlobDownload(response, "anexo");
  },
};
