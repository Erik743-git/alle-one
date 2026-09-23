"use client";

import { Suspense } from "react";
import { PortalTabSlot } from "@/components/layout/portal-tab-slot";
import { PortalPageComponent } from "./page-impl";

export default function AgendasPage() {
  return (
    <Suspense fallback={null}>
      <PortalTabSlot route="/agendas" Component={PortalPageComponent} />
    </Suspense>
  );
}
