"use client";

import { Suspense } from "react";
import { PortalTabSlot } from "@/components/layout/portal-tab-slot";
import { PortalPageComponent } from "./page-impl";

export default function OportunidadesPage() {
  return (
    <Suspense fallback={null}>
      <PortalTabSlot route="/oportunidades" Component={PortalPageComponent} />
    </Suspense>
  );
}
