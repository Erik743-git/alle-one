import { apiRequest } from "@/lib/api";
import type { AuthUser } from "@/lib/session";

export type MeResponse = {
  message: string;
  user: AuthUser;
};

export type AuthSessionResponse = {
  message: string;
  accessToken?: string;
  user: AuthUser;
};

export const authService = {
  async me(opts?: { skipSessionEnd?: boolean }) {
    return apiRequest<MeResponse>("/auth/me", {
      skipSessionEnd: opts?.skipSessionEnd,
    });
  },

  async switchCompany(companyId: string) {
    return apiRequest<AuthSessionResponse>("/auth/switch-company", {
      method: "POST",
      body: JSON.stringify({ companyId }),
    });
  },
};
