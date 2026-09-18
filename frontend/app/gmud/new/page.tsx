"use client";

import { PortalTabSlot } from "@/components/layout/portal-tab-slot";
import AppShell from "@/components/layout/app-shell";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { GmudForm } from "../_components/gmud-form";

function NewGmudPageImpl() {
  return (
    <ProtectedPage>
      <PermissionGate module="GMUD" flag="canCreate">
      <AppShell>
        <div className="font-sans w-full space-y-5">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-foreground">Nova GMUD</h1>
            <p className="text-muted-foreground">
              Crie uma nova mudança e envie para aprovação.
            </p>
          </div>
          <GmudForm mode="create" />
        </div>
      </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}

export { NewGmudPageImpl as PortalPageComponent };

export default function NewGmudPage() {
  return <PortalTabSlot route="/gmud/new" Component={NewGmudPageImpl} />;
}
