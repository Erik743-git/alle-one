import { API_URL } from "@/lib/env";
import type { ModulePermission } from "./permission-modules";

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
};

/** Legado: token em localStorage (Bearer). Novo fluxo usa cookie httpOnly. */
export const TOKEN_KEY = "alleone.token";
export const USER_KEY = "alleone.user";

function readUserRaw(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return (
    window.sessionStorage.getItem(USER_KEY) ??
    window.localStorage.getItem(USER_KEY)
  );
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(TOKEN_KEY);
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

function clearSessionSync() {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(TOKEN_KEY);
}

export function clearSession() {
  clearSessionSync();
  if (typeof window === "undefined") {
    return;
  }
  void fetch(`${API_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  }).catch(() => {
    /* API pode estar offline ao limpar sessão local */
  });
}
