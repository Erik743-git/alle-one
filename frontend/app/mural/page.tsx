"use client";

import { Suspense } from "react";
import { PortalTabSlot } from "@/components/layout/portal-tab-slot";
import { PortalPageComponent } from "./page-impl";

export default function MuralPage() {
  return (
    <Suspense fallback={null}>
      <PortalTabSlot route="/mural" Component={PortalPageComponent} />
    </Suspense>
  );
}
