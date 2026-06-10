"use client";

import Link from "next/link";
import { CalendarDays, Clock, Users } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

type ApontamentosAdminHubProps = {
  collaboratorCount: number;
  pendingOvertimeCount: number | null;
  loadingPending?: boolean;
};

export function ApontamentosAdminHub({
  collaboratorCount,
  pendingOvertimeCount,
  loadingPending = false,
}: ApontamentosAdminHubProps) {
  const pendingValue =
    loadingPending || pendingOvertimeCount == null
      ? "—"
      : String(pendingOvertimeCount);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="h-full">
        <CardContent className="flex items-start gap-4 pt-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Colaboradores
            </p>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {collaboratorCount}
            </p>
            <p className="text-xs text-muted-foreground">
              Com agenda disponível
            </p>
          </div>
        </CardContent>
      </Card>

      <Link
        href="/apontamentos/aprovar-horas-extras"
        className="group block"
      >
        <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/20">
          <CardContent className="flex items-start gap-4 pt-6">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-300">
              <Clock className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Horas extras pendentes
              </p>
              <p className="text-2xl font-bold tabular-nums text-foreground">
                {pendingValue}
              </p>
              <p className="text-xs text-muted-foreground">
                Aguardando análise no mês atual
              </p>
            </div>
            <CalendarDays className="ml-auto size-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
