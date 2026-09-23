"use client";

import { Suspense } from "react";
import { PortalTabSlot } from "@/components/layout/portal-tab-slot";
import { PortalPageComponent } from "./page-impl";

export default function PlantaoPage() {
  return (
    <Suspense fallback={null}>
      <PortalTabSlot route="/plantao" Component={PortalPageComponent} />
    </Suspense>
  );
}
