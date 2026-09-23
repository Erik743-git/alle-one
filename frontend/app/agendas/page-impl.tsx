"use client";

import { useState } from "react";

import { PlantaoOutlook } from "@/app/plantao/page-impl";
import ProtectedPage from "@/components/auth/protected-page";
import { EscalaAba } from "@/components/agendas/escala-aba";
import AppShell from "@/components/layout/app-shell";
import { cn } from "@/lib/utils";

const ABAS = [
  { id: "plantao", rotulo: "Plantão" },
  { id: "escala", rotulo: "Escala" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

/**
 * Agendas: Plantão (calendários do Outlook, igual a antes) e Escala (quem
 * responde por hora, cadastrada no portal). Manutenção entra como terceira
 * aba quando for feita.
 */
function AgendasPageImpl() {
  const [aba, setAba] = useState<Aba>("escala");

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

          {aba === "plantao" ? <PlantaoOutlook /> : <EscalaAba />}
        </div>
      </AppShell>
    </ProtectedPage>
  );
}

export { AgendasPageImpl as PortalPageComponent };
