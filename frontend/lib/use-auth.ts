"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isPublicRoute } from "./auth";
import {
  clearSession,
  getStoredUser,
  setStoredUser,
  type AuthUser,
} from "./session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

async function tryRestoreSessionFromCookie(): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${API_URL}/auth/me`, {
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

export function useAuth() {
  const router = useRouter();
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const restored = await tryRestoreSessionFromCookie();
      if (!cancelled) {
        if (restored) {
          setUser(restored);
        } else {
          clearSession();
          setUser(null);
        }
        setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Atualiza permissões após mudanças no admin (sem exigir logout).
  useEffect(() => {
    if (!hydrated) return;

    const refresh = () => {
      void tryRestoreSessionFromCookie().then((restored) => {
        if (restored) setUser(restored);
      });
    };

    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [hydrated, pathname]);

  const authenticated = !!user;
  const loading = !hydrated;

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!authenticated) {
      clearSession();
      if (!isPublicRoute(pathname)) {
        router.replace("/login");
      }
      return;
    }
    if (user?.firstAccess && pathname !== "/primeiro-acesso") {
      router.replace("/primeiro-acesso");
    }
  }, [hydrated, authenticated, user, pathname, router]);

  return {
    loading,
    authenticated,
    user,
  };
}
