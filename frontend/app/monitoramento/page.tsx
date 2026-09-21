"use client";

import { Suspense } from "react";
import { PortalTabSlot } from "@/components/layout/portal-tab-slot";
import { PortalPageComponent } from "./page-impl";

export default function MonitoramentoPage() {
  return (
    <Suspense fallback={null}>
      <PortalTabSlot route="/monitoramento" Component={PortalPageComponent} />
    </Suspense>
  );
}
