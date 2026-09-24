"use client";

import { useState } from "react";

import { PlantaoOutlook } from "@/app/plantao/page-impl";
import ProtectedPage from "@/components/auth/protected-page";
import { EscalaAba } from "@/components/agendas/escala-aba";
import { ManutencaoAba } from "@/components/agendas/manutencao-aba";
import AppShell from "@/components/layout/app-shell";
import { canAccessPlantao } from "@/lib/access-control";
import { useExigirAcesso } from "@/lib/use-exigir-acesso";
import { cn } from "@/lib/utils";

const ABAS = [
  { id: "plantao", rotulo: "Plantão" },
  { id: "escala", rotulo: "Escala" },
  { id: "manutencao", rotulo: "Manutenção" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

/**
 * Agendas: Plantão (calendários do Outlook, igual a antes), Escala (quem
 * responde por hora, cadastrada no portal) e Manutenção (janelas combinadas
 * com cada cliente, com as GMUDs por cima).
 */
function AgendasPageImpl() {
  const [aba, setAba] = useState<Aba>("escala");
  // Cliente que digita /agendas volta para o painel (a API já recusa).
  const semAcesso = useExigirAcesso(canAccessPlantao);

  return (
    <ProtectedPage>
      <AppShell>
        <div className="font-sans w-full space-y-5 pb-10">
          <h1 className="text-3xl font-bold text-foreground">Agendas</h1>

          <div role="tablist" className="flex gap-1 border-b border-border">
            {ABAS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={aba === item.id}
                onClick={() => setAba(item.id)}
                className={cn(
                  "-mb-px border-b-2 px-4 py-2 text-sm transition-colors",
                  aba === item.id
                    ? "border-primary font-semibold text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {item.rotulo}
              </button>
            ))}
          </div>

          {semAcesso ? null : aba === "plantao" ? (
            <PlantaoOutlook />
          ) : aba === "escala" ? (
            <EscalaAba />
          ) : (
            <ManutencaoAba />
          )}
        </div>
      </AppShell>
    </ProtectedPage>
  );
}

export { AgendasPageImpl as PortalPageComponent };
