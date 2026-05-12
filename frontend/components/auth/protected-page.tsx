"use client";

import { ReactNode, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/use-auth";
import { authService } from "@/lib/services/auth.service";
import { clearSession, setStoredUser } from "@/lib/session";

type ProtectedPageProps = {
  children: ReactNode;
};

export default function ProtectedPage({ children }: ProtectedPageProps) {
  const { loading, authenticated } = useAuth();
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const data = await authService.me();
        if (!cancelled && data.user) {
          setStoredUser(data.user);
        }
      } catch {
        if (!cancelled) {
          clearSession();
        }
      } finally {
        if (!cancelled) {
          setBooting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || booting) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background font-sans text-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando sessão…</p>
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return <>{children}</>;
}
