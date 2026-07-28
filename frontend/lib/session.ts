import { API_URL, getBrowserApiBase } from "@/lib/env";
import type { ModulePermission } from "./permission-modules";
import { purgeInvalidPersistedCompanyIds } from "./selected-company";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "COLLABORATOR" | "PJ" | "CLIENT";
  companyId: string | null;
  companyName: string | null;
  firstAccess: boolean;
  /** Efetivo (papéis + linhas em `permissions`). Ausente em sessões antigas até refresh. */
  permissions?: ModulePermission[];
  totpEnabled?: boolean;
  totpAdminMustEnable?: boolean;
};

/** @deprecated Sessão usa apenas cookie httpOnly — chave mantida para limpeza de legado. */
export const TOKEN_KEY = "alleone.token";
export const USER_KEY = "alleone.user";

function authLogoutUrl(): string {
  const base = getBrowserApiBase();
  if (base) return `${base}/auth/logout`;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/auth/logout`;
  }
  return `${API_URL.replace(/\/$/, "")}/auth/logout`;
}

function readUserRaw(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return (
    window.sessionStorage.getItem(USER_KEY) ??
    window.localStorage.getItem(USER_KEY)
  );
}

/** Legado removido — sempre null; use cookie httpOnly. */
export function getStoredToken(): string | null {
  purgeLegacyToken();
  return null;
}

function purgeLegacyToken(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function getStoredUser(): AuthUser | null {
  const raw = readUserRaw();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    clearSessionSync();
    return null;
  }
}

/** Persiste só o perfil no browser (JWT fica no cookie httpOnly definido pela API). */
export function setStoredUser(user: AuthUser) {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  try {
    window.localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

/** Persiste perfil no browser; JWT permanece só no cookie httpOnly da API. */
export function setSession(_token: string | null | undefined, user: AuthUser) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  setStoredUser(user);
}

export function clearSessionSync() {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(TOKEN_KEY);
  purgeInvalidPersistedCompanyIds();
}

export type SessionEndReason = "expired" | "idle";

/** Redireciona ao login com motivo (toast/alerta na página). */
export function redirectToLogin(reason?: SessionEndReason) {
  if (typeof window === "undefined") {
    return;
  }
  if (window.location.pathname.startsWith("/login")) {
    return;
  }
  const q = reason ? `?reason=${reason}` : "";
  window.location.replace(`/login${q}`);
}

/** Encerra sessão na API e limpa dados locais (preserva cookie de trust 2FA no backend). */
export async function logoutSession(): Promise<void> {
  clearSessionSync();
  if (typeof window === "undefined") {
    return;
  }
  try {
    await fetch(authLogoutUrl(), {
      method: "POST",
      credentials: "include",
    });
  } catch {
    /* API pode estar offline ao limpar sessão local */
  }
}

/** Encerra sessão e vai ao login com motivo (401 / idle). */
export async function endSession(reason?: SessionEndReason): Promise<void> {
  await logoutSession();
  redirectToLogin(reason);
}

/** Limpa sessão local + cookie de acesso (sem forçar redirect). */
export function clearSession() {
  void logoutSession();
}
