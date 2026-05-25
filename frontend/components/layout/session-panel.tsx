"use client";

import { useRouter } from "next/navigation";
import { LogOut, Shield, User2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearSession, getStoredUser } from "@/lib/session";

function getRoleLabel(role?: string) {
  switch (role) {
    case "ADMIN":
      return "Admin";
    case "COLLABORATOR":
      return "Colaborador";
    case "CLIENT":
      return "Cliente";
    default:
      return "Usuário";
  }
}

export default function SessionPanel({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const user = getStoredUser();

  function handleLogout() {
    clearSession();
    router.replace("/login");
    setTimeout(() => {
      window.location.replace("/login");
    }, 50);
  }

  if (!user) {
    return null;
  }

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"
          title={user.name}
        >
          <User2 size={18} />
        </div>
        <Button
          type="button"
          onClick={handleLogout}
          variant="destructive"
          size="icon"
          className="h-10 w-10 rounded-xl"
          aria-label="Sair"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
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
            {getRoleLabel(user.role)}
          </div>
        </div>
      </div>

      <Button
        type="button"
        onClick={handleLogout}
        variant="destructive"
        className="mt-4 h-10 w-full rounded-xl"
      >
        <LogOut className="mr-2 h-4 w-4" />
        Sair
      </Button>
    </div>
  );
}
