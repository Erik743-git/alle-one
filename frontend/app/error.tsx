"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, Home } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AlleBrandLogo } from "@/components/brand/alle-brand-logo";

/**
 * Erro inesperado em qualquer tela do portal.
 *
 * Sem este arquivo o Next mostra "Application error: a client-side exception
 * has occurred" numa página branca, sem saída além de F5. O `reset()` tenta
 * renderizar de novo sem recarregar a aplicação inteira.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // O @sentry/nextjs (quando o DSN está configurado) captura erros de
    // boundary automaticamente; o console garante rastro em qualquer caso.
    console.error("Erro nao tratado na tela:", error);
  }, [error]);

  return (
    <div className="font-sans relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 text-foreground">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_-15%,rgba(18,181,217,0.06),transparent_55%)] dark:bg-[radial-gradient(ellipse_100%_60%_at_50%_-15%,rgba(18,181,217,0.11),transparent_50%)]"
        aria-hidden
      />
      <div className="relative flex w-full max-w-md flex-col items-center gap-6 text-center">
        <AlleBrandLogo width={150} height={54} />

        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Algo deu errado nesta tela</h1>
          <p className="text-sm text-muted-foreground">
            O erro foi registrado e a equipe consegue investigar. Você pode
            tentar de novo — seus dados não foram perdidos.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" onClick={reset}>
            <RefreshCw className="mr-2 size-4" />
            Tentar de novo
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/tickets">
              <Home className="mr-2 size-4" />
              Ir para os chamados
            </Link>
          </Button>
        </div>

        {/* O digest é o que liga esta tela ao registro do erro no servidor. */}
        {error.digest ? (
          <p className="font-mono text-[11px] text-muted-foreground/70">
            Código: {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  );
}
