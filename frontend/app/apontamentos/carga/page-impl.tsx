"use client";

import Link from "next/link";
import { ArrowLeft, Gauge } from "lucide-react";

import ProtectedPage from "@/components/auth/protected-page";
import { CargaEquipe } from "@/components/apontamentos/carga-equipe";
import AppShell from "@/components/layout/app-shell";
import { canAccessCargaEquipe } from "@/lib/access-control";
import { useExigirAcesso } from "@/lib/use-exigir-acesso";

/** Carga da equipe em tela própria: é por aqui que o colaborador liberado entra. */
function CargaEquipePageImpl() {
  const semAcesso = useExigirAcesso(canAccessCargaEquipe);
  return (
    <ProtectedPage>
      <AppShell>
        <div className="font-sans w-full space-y-6">
          <div className="space-y-2">
            <Link
              href="/apontamentos"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft size={16} /> Apontamentos
            </Link>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <Gauge className="size-6" aria-hidden /> Carga da equipe
            </h1>
          </div>
          {semAcesso ? null : <CargaEquipe />}
        </div>
      </AppShell>
    </ProtectedPage>
  );
}

export { CargaEquipePageImpl as PortalPageComponent };
