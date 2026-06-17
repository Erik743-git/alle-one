"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { isPublicRoute } from "./auth";
import {
  clearSessionSync,
  getStoredUser,
  logoutSession,
  setStoredUser,
  type AuthUser,
} from "./session";
import { purgeInvalidPersistedCompanyIds } from "./selected-company";
import { API_URL, getBrowserApiBase } from "@/lib/env";

function authMeUrl(): string {
  const base = getBrowserApiBase();
  if (base) return `${base}/auth/me`;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/auth/me`;
  }
  return `${API_URL.replace(/\/$/, "")}/auth/me`;
}

type AuthContextValue = {
  loading: boolean;
  authenticated: boolean;
  user: AuthUser | null;
  refreshUser: () => Promise<void>;
  /** Após POST /auth/login — atualiza estado sem depender só do sessionStorage. */
  establishSession: (user: AuthUser) => void;
  signOut: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

async function tryRestoreSessionFromCookie(): Promise<AuthUser | null> {
  try {
    const res = await fetch(authMeUrl(), {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { user?: AuthUser };
    if (data?.user) {
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
  const [user, setUser] = React.useState<AuthUser | null>(() => getStoredUser());
  const refreshInFlight = React.useRef<Promise<void> | null>(null);

  const establishSession = React.useCallback((nextUser: AuthUser) => {
    setStoredUser(nextUser);
    purgeInvalidPersistedCompanyIds();
    setUser(nextUser);
  }, []);

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

      const stored = getStoredUser();
      if (stored) {
        setUser(stored);
        return;
      }

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

    const onFocus = () => {
      void refreshUser();
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
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
      signOut,
    }),
    [loading, authenticated, user, refreshUser, establishSession, signOut],
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
