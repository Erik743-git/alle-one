"use client";

import { ReactNode } from "react";
import { useAuth } from "@/lib/use-auth";
import { AlleBrandLogo } from "@/components/brand/alle-brand-logo";

type ProtectedPageProps = {
  children: ReactNode;
};

/** Páginas autenticadas — sessão restaurada por `useAuth` (sem segunda chamada /auth/me). */
export default function ProtectedPage({ children }: ProtectedPageProps) {
  const { loading, authenticated } = useAuth();

  if (loading) {
    return (
      <div className="font-sans relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-background text-foreground">
        {/* Mesmo halo do AppShell, para a transição não "piscar" de fundo. */}
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_-15%,rgba(18,181,217,0.06),transparent_55%)] dark:bg-[radial-gradient(ellipse_100%_60%_at_50%_-15%,rgba(18,181,217,0.11),transparent_50%)]"
          aria-hidden
        />
        <div className="relative flex flex-col items-center gap-6">
          <AlleBrandLogo width={340} height={120} priority className="max-w-full" />
          {/* Barra indeterminada: menos ansiosa que spinner girando. */}
          <div
            className="h-0.5 w-40 overflow-hidden rounded-full bg-border"
            role="status"
            aria-label="Carregando sessão"
          >
            <div className="alle-loading-sweep h-full w-1/3 rounded-full bg-primary" />
          </div>
          <p className="text-sm text-muted-foreground">Carregando sua sessão…</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return <>{children}</>;
}
