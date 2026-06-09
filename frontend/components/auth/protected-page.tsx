"use client";

import { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/use-auth";

type ProtectedPageProps = {
  children: ReactNode;
};

/** Páginas autenticadas — sessão restaurada por `useAuth` (sem segunda chamada /auth/me). */
export default function ProtectedPage({ children }: ProtectedPageProps) {
  const { loading, authenticated } = useAuth();

  if (loading) {
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
