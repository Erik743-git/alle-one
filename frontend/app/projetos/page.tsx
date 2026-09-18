"use client";

import { Suspense } from "react";
import { PortalTabSlot } from "@/components/layout/portal-tab-slot";
import { PortalPageComponent } from "./page-impl";

export default function ProjetosPage() {
  // Suspense porque a tela lê a query string; sem ele o Next recusa o
  // prerender da rota.
  return (
    <Suspense fallback={null}>
      <PortalTabSlot route="/projetos" Component={PortalPageComponent} />
    </Suspense>
  );
}
