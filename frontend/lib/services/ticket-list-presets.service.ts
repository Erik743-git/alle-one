import { apiRequest } from "@/lib/api";
import type {
  TicketListPreset,
  TicketListPresetConfig,
} from "@/lib/tickets/list-presets";

export type CreateTicketListPresetPayload = {
  name: string;
  color?: string;
  isPublic?: boolean;
  isPinned?: boolean;
  config: TicketListPresetConfig;
};

export type UpdateTicketListPresetPayload = Partial<
  CreateTicketListPresetPayload
> & {
  sortOrder?: number;
};

export const ticketListPresetsService = {
  list() {
    return apiRequest<TicketListPreset[]>("/tickets/list-presets");
  },
  create(payload: CreateTicketListPresetPayload) {
    return apiRequest<TicketListPreset>("/tickets/list-presets", {
      method: "POST",
      body: payload,
    });
  },
  update(id: string, payload: UpdateTicketListPresetPayload) {
    return apiRequest<TicketListPreset>(`/tickets/list-presets/${id}`, {
      method: "PATCH",
      body: payload,
    });
  },
  remove(id: string) {
    return apiRequest<{ ok: true }>(`/tickets/list-presets/${id}`, {
      method: "DELETE",
    });
  },
};
