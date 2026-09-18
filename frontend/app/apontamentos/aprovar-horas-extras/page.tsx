"use client";

import { Suspense } from "react";
import { PortalTabSlot } from "@/components/layout/portal-tab-slot";
import { PortalPageComponent } from "./page-impl";

export default function AprovarHorasExtrasPage() {
  // Suspense porque a tela lê a query string; sem ele o Next recusa o
  // prerender da rota.
  return (
    <Suspense fallback={null}>
      <PortalTabSlot route="/apontamentos/aprovar-horas-extras" Component={PortalPageComponent} />
    </Suspense>
  );
}
