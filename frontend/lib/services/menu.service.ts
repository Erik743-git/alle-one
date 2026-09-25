import { apiRequest } from "@/lib/api";
import type { PreferenciaMenu } from "@/lib/menu-lateral";

export const menuService = {
  salvar(preferencia: PreferenciaMenu) {
    return apiRequest<PreferenciaMenu>("/me/menu", {
      method: "PUT",
      body: preferencia,
    });
  },
  voltarAoPadrao() {
    return apiRequest<{ ok: true }>("/me/menu", { method: "DELETE" });
  },
};
