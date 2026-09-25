"use client";

import { Suspense } from "react";
import { PortalTabSlot } from "@/components/layout/portal-tab-slot";
import { PortalPageComponent } from "./page-impl";

export default function CargaEquipePage() {
  return (
    <Suspense fallback={null}>
      <PortalTabSlot
        route="/apontamentos/carga"
        Component={PortalPageComponent}
      />
    </Suspense>
  );
}
