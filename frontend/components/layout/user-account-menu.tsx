"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Lock,
  LockOpen,
  LogOut,
  Mail,
  Shield,
  User2,
} from "lucide-react";
import { Security2faDialog } from "@/components/auth/security-2fa-dialog";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { canAccessCorreio } from "@/lib/access-control";
import { roleDisplayLabel } from "@/lib/app-roles";
import { mailboxService } from "@/lib/services/mailbox.service";
import { useAuth } from "@/lib/use-auth";
import { cn } from "@/lib/utils";

type Props = {
  collapsed?: boolean;
};

function resolveCompanyLabel(user: {
  companyName: string | null;
  companies?: Array<{ name: string }>;
}): string | null {
  const primary = user.companyName?.trim();
  if (primary) return primary;
  const names = (user.companies ?? [])
    .map((c) => c.name?.trim())
    .filter(Boolean);
  if (names.length === 0) return null;
  if (names.length === 1) return names[0]!;
  return `${names[0]} +${names.length - 1}`;
}

export function UserAccountMenu({ collapsed = false }: Props) {
  const { signOut, user, refreshUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const totpEnabled = Boolean(user?.totpEnabled);
  const showCorreio = canAccessCorreio();
  const companyLabel = useMemo(
    () => (user ? resolveCompanyLabel(user) : null),
    [user],
  );

  useEffect(() => {
    if (!showCorreio) {
      setUnread(0);
      return;
    }
    let cancelled = false;
    void mailboxService
      .unreadCount()
      .then((res) => {
        if (!cancelled) setUnread(res.count);
      })
      .catch(() => {
        if (!cancelled) setUnread(0);
      });
    return () => {
      cancelled = true;
    };
  }, [showCorreio, open]);

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
    setOpen(false);
    void refreshUser().catch(() => undefined);
    setSecurityOpen(true);
  }

  if (!user) return null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={
              collapsed
                ? "relative h-10 w-10 shrink-0 rounded-xl border-border bg-card/60 p-0 text-foreground hover:bg-accent hover:text-accent-foreground"
                : "relative h-9 w-9 shrink-0 rounded-xl border-border bg-card/60 p-0 text-foreground hover:bg-accent hover:text-accent-foreground"
            }
            title="Conta e notificações"
            aria-label="Conta e notificações"
          >
            <User2 size={collapsed ? 18 : 16} strokeWidth={2} />
            {unread > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold leading-4 text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align={collapsed ? "start" : "end"}
          side="right"
          sideOffset={10}
          className="w-[min(calc(100vw-2rem),17.5rem)] rounded-xl border-border bg-card p-0 text-card-foreground shadow-lg"
        >
          <div className="space-y-2 px-3.5 pb-3 pt-3.5">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <User2 size={16} />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate text-sm font-semibold leading-tight">
                  {user.name}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {user.email}
                </p>
                {companyLabel ? (
                  <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                    <Building2 className="size-3 shrink-0 opacity-70" />
                    <span className="truncate">{companyLabel}</span>
                  </p>
                ) : null}
                <p className="inline-flex items-center gap-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Shield className="size-3" />
                  {roleDisplayLabel(user.role)}
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-border px-1.5 py-1.5">
            {showCorreio ? (
              <Link
                href="/correio"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-foreground transition hover:bg-muted"
              >
                <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">Correio</span>
                {unread > 0 ? (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-muted-foreground">
                    0
                  </span>
                )}
              </Link>
            ) : null}

            <button
              type="button"
              onClick={openSecurity}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition hover:bg-muted",
                totpEnabled
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground",
              )}
            >
              {totpEnabled ? (
                <Lock className="size-3.5 shrink-0" />
              ) : (
                <LockOpen className="size-3.5 shrink-0" />
              )}
              <span className="min-w-0 flex-1">
                {totpEnabled ? "2FA ativo" : "2FA inativo"}
              </span>
              <span className="text-[10px] font-medium text-muted-foreground">
                Segurança
              </span>
            </button>
          </div>

          <div className="border-t border-border p-1.5">
            <Button
              type="button"
              disabled={loggingOut}
              onClick={() => void handleLogout()}
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-start gap-2 rounded-lg px-2.5 text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="size-3.5" />
              Sair
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Security2faDialog open={securityOpen} onOpenChange={setSecurityOpen} />
    </>
  );
}
