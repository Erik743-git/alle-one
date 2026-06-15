"use client";

import Link from "next/link";
import { CalendarDays, Clock, FileText, Users } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ApontamentosAdminHubProps = {
  collaboratorCount: number;
  pendingOvertimeCount: number | null;
  pendingJustificationVoluntary: number | null;
  pendingJustificationAlert: number | null;
  loadingPending?: boolean;
};

function pendingDisplay(value: number | null, loading: boolean) {
  if (loading || value == null) return "—";
  return String(value);
}

export function ApontamentosAdminHub({
  collaboratorCount,
  pendingOvertimeCount,
  pendingJustificationVoluntary,
  pendingJustificationAlert,
  loadingPending = false,
}: ApontamentosAdminHubProps) {
  const pendingOvertimeValue = pendingDisplay(
    pendingOvertimeCount,
    loadingPending,
  );
  const voluntaryValue = pendingDisplay(
    pendingJustificationVoluntary,
    loadingPending,
  );
  const alertValue = pendingDisplay(pendingJustificationAlert, loadingPending);
  const justificationTotal =
    pendingJustificationVoluntary != null &&
    pendingJustificationAlert != null
      ? pendingJustificationVoluntary + pendingJustificationAlert
      : null;
  const justificationTotalValue = pendingDisplay(
    justificationTotal,
    loadingPending,
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                {pendingOvertimeValue}
              </p>
              <p className="text-xs text-muted-foreground">
                Aguardando análise no mês atual
              </p>
            </div>
            <CalendarDays className="ml-auto size-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
          </CardContent>
        </Card>
      </Link>

      <Link
        href="/apontamentos/aprovar-justificativas"
        className="group block sm:col-span-2 xl:col-span-1"
      >
        <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/20">
          <CardContent className="flex items-start gap-4 pt-6">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-300">
              <FileText className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Justificativas pendentes
              </p>
              <p className="text-2xl font-bold tabular-nums text-foreground">
                {justificationTotalValue}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold",
                    "bg-violet-500/10 text-violet-700 ring-1 ring-inset ring-violet-500/30",
                    "dark:text-violet-300",
                  )}
                >
                  Voluntária {voluntaryValue}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold",
                    "bg-orange-500/10 text-orange-800 ring-1 ring-inset ring-orange-500/35",
                    "dark:text-orange-300",
                  )}
                >
                  Alerta {alertValue}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Lacunas e justificativas do mês atual
              </p>
            </div>
            <CalendarDays className="ml-auto size-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
