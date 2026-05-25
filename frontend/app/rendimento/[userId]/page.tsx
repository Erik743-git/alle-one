"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import AppShell from "@/components/layout/app-shell";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { Button } from "@/components/ui/button";
import {
  RendimentoCalendar,
  toDateInputValue,
} from "@/components/rendimento/rendimento-calendar";
import {
  rendimentoService,
  type RendimentoCalendarView,
  type RendimentoTimesheet,
} from "@/lib/services/rendimento.service";

export default function RendimentoAgendaPage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;

  const [view, setView] = useState<RendimentoCalendarView>("month");
  const [referenceDate, setReferenceDate] = useState(() => new Date());
  const [timesheet, setTimesheet] = useState<RendimentoTimesheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadTimesheet = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      setError("");
      const data = await rendimentoService.getTimesheet({
        userId,
        view,
        date: toDateInputValue(referenceDate),
      });
      setTimesheet(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar a agenda de horas.",
      );
      setTimesheet(null);
    } finally {
      setLoading(false);
    }
  }, [referenceDate, userId, view]);

  useEffect(() => {
    void loadTimesheet();
  }, [loadTimesheet]);

  return (
    <ProtectedPage>
      <PermissionGate module="RENDIMENTO">
        <AppShell>
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <Button asChild variant="outline" size="sm" className="w-fit">
                  <Link href="/rendimento">
                    <ArrowLeft className="mr-2 size-4" />
                    Voltar à lista
                  </Link>
                </Button>
                <h1 className="text-2xl font-bold text-foreground">
                  Agenda de horas
                </h1>
                <p className="text-sm text-muted-foreground">
                  {timesheet?.userName ?? "Colaborador"} · apontamentos TiFlux
                </p>
              </div>
            </div>

            {error ? (
              <div className="alle-alert-error rounded-xl p-4 text-sm">{error}</div>
            ) : null}

            <RendimentoCalendar
              timesheet={timesheet}
              view={view}
              referenceDate={referenceDate}
              loading={loading}
              onViewChange={setView}
              onReferenceDateChange={setReferenceDate}
            />

          </div>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
