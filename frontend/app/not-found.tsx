import Link from "next/link";
import { Home, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AlleBrandLogo } from "@/components/brand/alle-brand-logo";

export default function NotFound() {
  return (
    <div className="font-sans relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 text-foreground">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_-15%,rgba(18,181,217,0.06),transparent_55%)] dark:bg-[radial-gradient(ellipse_100%_60%_at_50%_-15%,rgba(18,181,217,0.11),transparent_50%)]"
        aria-hidden
      />
      <div className="relative flex w-full max-w-md flex-col items-center gap-6 text-center">
        <AlleBrandLogo width={300} height={108} className="max-w-full" />

        <div className="space-y-2">
          <p className="font-mono text-4xl font-semibold tabular-nums text-primary">
            404
          </p>
          <h1 className="text-xl font-semibold">Página não encontrada</h1>
          <p className="text-sm text-muted-foreground">
            O endereço não existe ou o item foi removido. Se você chegou por um
            link antigo, ele pode ter mudado de lugar.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild>
            <Link href="/tickets">
              <Home className="mr-2 size-4" />
              Ir para os chamados
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">
              <Search className="mr-2 size-4" />
              Abrir o dashboard
            </Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground/70">
          Dica: use <kbd className="rounded border border-border px-1">Ctrl</kbd>{" "}
          + <kbd className="rounded border border-border px-1">K</kbd> para
          buscar um chamado de qualquer tela.
        </p>
      </div>
    </div>
  );
}
