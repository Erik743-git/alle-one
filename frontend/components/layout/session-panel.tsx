"use client";

import { useState } from "react";
import { Lock, LockOpen, LogOut, Shield, User2 } from "lucide-react";
import { Security2faDialog } from "@/components/auth/security-2fa-dialog";
import { Button } from "@/components/ui/button";
import { roleDisplayLabel } from "@/lib/app-roles";
import { useAuth } from "@/lib/use-auth";
import { cn } from "@/lib/utils";

export default function SessionPanel({ collapsed = false }: { collapsed?: boolean }) {
  const { signOut, user, refreshUser } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);

  const totpEnabled = Boolean(user?.totpEnabled);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await signOut();
    } finally {
      window.location.replace("/login");
    }
  }

  function openSecurity() {
    void refreshUser().catch(() => undefined);
    setSecurityOpen(true);
  }

  if (!user) {
    return null;
  }

  const lockButtonClass = cn(
    "rounded-xl",
    totpEnabled
      ? "border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
      : "text-muted-foreground",
  );

  return (
    <>
      {collapsed ? (
        <div className="flex w-full flex-col items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn("h-10 w-10 shrink-0", lockButtonClass)}
            aria-label={
              totpEnabled ? "2FA ativo — Segurança" : "2FA inativo — Segurança"
            }
            title={totpEnabled ? "2FA ativo" : "2FA inativo"}
            onClick={openSecurity}
          >
            {totpEnabled ? (
              <Lock className="size-[18px]" strokeWidth={2} />
            ) : (
              <LockOpen className="size-[18px]" strokeWidth={2} />
            )}
          </Button>
          <Button
            type="button"
            disabled={loggingOut}
            onClick={() => void handleLogout()}
            variant="destructive"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl"
            aria-label={`Sair (${user.name})`}
            title={`Sair — ${user.name}`}
          >
            <LogOut className="size-[18px]" strokeWidth={2} />
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-4 text-card-foreground">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
              title={user.name}
            >
              <User2 size={18} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Shield size={12} />
                {roleDisplayLabel(user.role)}
              </div>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className={cn("mt-4 h-10 w-full", lockButtonClass)}
            onClick={openSecurity}
          >
            {totpEnabled ? (
              <Lock className="mr-2 h-4 w-4" />
            ) : (
              <LockOpen className="mr-2 h-4 w-4" />
            )}
            {totpEnabled ? "2FA ativo" : "2FA inativo"}
          </Button>

          <Button
            type="button"
            disabled={loggingOut}
            onClick={() => void handleLogout()}
            variant="destructive"
            className="mt-2 h-10 w-full rounded-xl"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      )}

      <Security2faDialog open={securityOpen} onOpenChange={setSecurityOpen} />
    </>
  );
}
