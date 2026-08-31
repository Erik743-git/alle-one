"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { isPublicRoute } from "./auth";
import {
  clearSessionSync,
  logoutSession,
  setStoredUser,
  type AuthUser,
} from "./session";
import { syncDeviceTrustFromResponse, readDeviceTrustToken } from "./device-trust";
import { purgeInvalidPersistedCompanyIds } from "./selected-company";
import { buildAuthApiUrl } from "./auth-api-url";
import { authService } from "@/lib/services/auth.service";
import { notifyError } from "@/lib/notify";

function authMeUrl(): string {
  return buildAuthApiUrl("/me");
}

type AuthContextValue = {
  loading: boolean;
  authenticated: boolean;
  user: AuthUser | null;
  refreshUser: () => Promise<void>;
  /** Após POST /auth/login — atualiza estado sem depender só do sessionStorage. */
  establishSession: (user: AuthUser) => void;
  switchCompany: (companyId: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

async function tryRestoreSessionFromCookie(): Promise<AuthUser | null> {
  try {
    const deviceTrustToken = readDeviceTrustToken();
    const res = await fetch(authMeUrl(), {
      method: "GET",
      credentials: "include",
      headers: deviceTrustToken
        ? { "X-Alleone-Device-Trust": deviceTrustToken }
        : undefined,
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { user?: AuthUser; deviceTrustToken?: string };
    if (data?.user) {
      syncDeviceTrustFromResponse(data.deviceTrustToken);
      setStoredUser(data.user);
      return data.user;
    }
  } catch {
    /* rede */
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [hydrated, setHydrated] = React.useState(false);
  // Só confiar no usuário após /auth/me (cookie). Storage é preenchido depois.
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const refreshInFlight = React.useRef<Promise<void> | null>(null);

  const establishSession = React.useCallback((nextUser: AuthUser) => {
    setStoredUser(nextUser);
    purgeInvalidPersistedCompanyIds();
    setUser(nextUser);
  }, []);

  const switchCompany = React.useCallback(
    async (companyId: string) => {
      try {
        const session = await authService.switchCompany(companyId);
        establishSession(session.user);
        // Recarrega dados da empresa ativa (tickets/dashboard).
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      } catch (err) {
        notifyError(
          err instanceof Error ? err.message : "Não foi possível trocar de empresa.",
        );
        throw err;
      }
    },
    [establishSession],
  );

  const signOut = React.useCallback(async () => {
    setUser(null);
    await logoutSession();
  }, []);

  const refreshUser = React.useCallback(async () => {
    if (refreshInFlight.current) {
      await refreshInFlight.current;
      return;
    }

    const task = (async () => {
      const restored = await tryRestoreSessionFromCookie();
      if (restored) {
        setUser(restored);
        return;
      }

      // Cookie inválido/ausente: não confiar em sessionStorage antigo (gera loop
      // dashboard → 401 → "Sessão expirada").
      clearSessionSync();
      setUser(null);
    })();

    refreshInFlight.current = task;
    try {
      await task;
    } finally {
      refreshInFlight.current = null;
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshUser();
      if (!cancelled) {
        setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshUser]);

  React.useEffect(() => {
    if (!hydrated) return;

    let debounceId: number | null = null;
    const onFocus = () => {
      if (debounceId != null) window.clearTimeout(debounceId);
      debounceId = window.setTimeout(() => {
        void refreshUser();
      }, 2_000);
    };

    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (debounceId != null) window.clearTimeout(debounceId);
    };
  }, [hydrated, refreshUser]);

  const authenticated = !!user;
  const loading = !hydrated;

  React.useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!authenticated) {
      if (!isPublicRoute(pathname)) {
        void logoutSession().finally(() => setUser(null));
        router.replace("/login");
      }
      return;
    }
    if (user?.firstAccess && pathname !== "/primeiro-acesso") {
      router.replace("/primeiro-acesso");
    }
  }, [hydrated, authenticated, user, pathname, router]);

  const value = React.useMemo(
    () => ({
      loading,
      authenticated,
      user,
      refreshUser,
      establishSession,
      switchCompany,
      signOut,
    }),
    [
      loading,
      authenticated,
      user,
      refreshUser,
      establishSession,
      switchCompany,
      signOut,
    ],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider");
  }
  return context;
}
