"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Building2, Check } from "lucide-react";
import { useAuth } from "@/lib/use-auth";
import { isClientPortalRole } from "@/lib/app-roles";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function SidebarCompanySwitcher({
  collapsed,
}: {
  collapsed: boolean;
}) {
  const { user, switchCompany } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const companies = useMemo(() => {
    const raw = user?.companies ?? [];
    const byId = new Map<string, (typeof raw)[number]>();
    for (const c of raw) {
      if (c?.id && !byId.has(c.id)) byId.set(c.id, c);
    }
    return [...byId.values()];
  }, [user?.companies]);

  const canSwitch = companies.length >= 2;
  const show =
    !!user && isClientPortalRole(user.role) && companies.length >= 1;

  const activeName = useMemo(() => {
    if (!user) return null;
    return (
      companies.find((c) => c.id === user.companyId)?.name ??
      user.companyName ??
      "Empresa"
    );
  }, [user, companies]);

  if (!show) return null;

  async function apply(companyId: string) {
    if (!canSwitch || !user || companyId === user.companyId) {
      setOpen(false);
      return;
    }
    try {
      setBusy(true);
      await switchCompany(companyId);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  async function toggleOther() {
    if (!canSwitch || companies.length !== 2 || !user?.companyId) {
      if (canSwitch) setOpen(true);
      return;
    }
    const other = companies.find((c) => c.id !== user.companyId);
    if (other) await apply(other.id);
  }

  if (collapsed) {
    if (!canSwitch) {
      return (
        <div className="flex w-full justify-center border-b border-sidebar-border py-2">
          <div
            title={activeName ?? "Empresa"}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-foreground/80"
          >
            <Building2 className="size-4" />
          </div>
        </div>
      );
    }

    return (
      <div className="flex w-full justify-center border-b border-sidebar-border py-2">
        <button
          type="button"
          title={`Trocar empresa (${activeName ?? "Empresa"})`}
          disabled={busy}
          onClick={() => void toggleOther()}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:opacity-50"
        >
          <Building2 className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="border-b border-sidebar-border px-3 py-2">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
          Empresa
        </p>
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1 truncate text-xs font-semibold text-sidebar-foreground">
            {activeName}
          </div>
          {canSwitch && companies.length === 2 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 px-2 text-xs"
              disabled={busy}
              onClick={() => void toggleOther()}
              title="Trocar de empresa"
            >
              <ArrowLeftRight className="size-3.5" />
            </Button>
          ) : null}
          {canSwitch && companies.length >= 3 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 px-2 text-xs"
              disabled={busy}
              onClick={() => setOpen(true)}
            >
              Trocar
            </Button>
          ) : null}
        </div>
      </div>

      {canSwitch ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Escolher empresa</DialogTitle>
            </DialogHeader>
            <ul className="space-y-1">
              {companies.map((c) => {
                const active = c.id === user?.companyId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void apply(c.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition",
                        active
                          ? "border-primary/40 bg-primary/10"
                          : "border-border hover:bg-muted/50",
                      )}
                    >
                      <span className="font-medium">{c.name}</span>
                      {active ? <Check className="size-4 text-primary" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
