"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AppShell from "@/components/layout/app-shell";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { DeferredResponsiveContainer } from "@/components/charts/deferred-responsive-container";
import { useChartTheme, useChartTooltipProps } from "@/lib/chart-theme";
import { getStoredUser } from "@/lib/session";
import {
  companiesService,
  type Company,
} from "@/lib/services/companies.service";
import {
  getCompleteDashboard,
  refreshCompleteDashboard,
  type DashboardAlertasMes,
  type DashboardAlertasSemana,
  type DashboardChamadosMes,
  type DashboardCompleteResponse,
  type DashboardHorasMes,
  type DashboardTopHostsMes,
  type DashboardTopTrigger,
  type WorkHoursTifluxLine,
  type WorkHoursTifluxSummary,
} from "@/lib/services/dashboard.service";
import {
  AlertCircle,
  Building2,
  Clock3,
  RefreshCcw,
  Server,
  ShieldAlert,
  Ticket,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const MANUAL_REFRESH_COOLDOWN_MS = 20000;
const AUTO_REFRESH_INTERVAL_MS = 120000;

function MetricCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border border-border bg-card text-card-foreground">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function toRangeDateString(date: string, endOfDay: boolean) {
  return `${date}T${endOfDay ? "23:59:59" : "00:00:00"}`;
}

function isValidDateInput(value: string) {
  if (!value) return false;
  // value do input[type=date] é YYYY-MM-DD
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === mo - 1 &&
    dt.getDate() === d
  );
}

function buildEmptyHoursRows(
  startIso?: string,
  endIso?: string,
): DashboardHorasMes[] {
  if (!startIso || !endIso) {
    return [];
  }

  const start = new Date(startIso);
  const end = new Date(endIso);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [];
  }

  const rows: DashboardHorasMes[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const limit = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= limit) {
    const monthKey = `${cursor.getFullYear()}-${String(
      cursor.getMonth() + 1,
    ).padStart(2, "0")}`;

    const monthLabel = cursor.toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });

    rows.push({
      monthKey,
      monthLabel,
      Infraestrutura: 0,
      Sistema: 0,
      NOC: 0,
      Rotinas: 0,
      Consult: 0,
      Total: 0,
    });

    cursor.setMonth(cursor.getMonth() + 1);
  }

  return rows;
}

function normalizeWorkHoursSummary(raw: unknown): WorkHoursTifluxSummary | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const buckets = new Set(["externo", "remoto", "interno", "sem"]);
  const linhasRaw = Array.isArray(o.linhas) ? o.linhas : [];
  const linhas: WorkHoursTifluxLine[] = linhasRaw.map((line) => {
    const l = line as Record<string, unknown>;
    const b = String(l.assistenciaBucket ?? "sem");
    return {
      data: String(l.data ?? ""),
      horaInicio: String(l.horaInicio ?? ""),
      horaFim: String(l.horaFim ?? ""),
      duracaoFormatada: String(l.duracaoFormatada ?? ""),
      assistencia: String(l.assistencia ?? ""),
      assistenciaBucket: buckets.has(b)
        ? (b as WorkHoursTifluxLine["assistenciaBucket"])
        : "sem",
      ticketNumber: Number(l.ticketNumber ?? 0),
      titulo: String(l.titulo ?? ""),
      atendente: String(l.atendente ?? ""),
    };
  });

  return {
    totalTicketsDistintos: Number(o.totalTicketsDistintos ?? 0),
    totalMinutos: Number(o.totalMinutos ?? 0),
    totalHorasFormatadas: String(o.totalHorasFormatadas ?? "00:00"),
    semAssistenciaMinutos: Number(o.semAssistenciaMinutos ?? 0),
    semAssistenciaFormatado: String(o.semAssistenciaFormatado ?? "00:00"),
    externoMinutos: Number(o.externoMinutos ?? 0),
    externoFormatado: String(o.externoFormatado ?? "00:00"),
    remotoMinutos: Number(o.remotoMinutos ?? 0),
    remotoFormatado: String(o.remotoFormatado ?? "00:00"),
    internoMinutos: Number(o.internoMinutos ?? 0),
    internoFormatado: String(o.internoFormatado ?? "00:00"),
    totalApontamentosNoPeriodo: Number.isFinite(Number(o.totalApontamentosNoPeriodo))
      ? Number(o.totalApontamentosNoPeriodo)
      : linhas.length,
    limiteLinhas: Number.isFinite(Number(o.limiteLinhas))
      ? Number(o.limiteLinhas)
      : linhas.length,
    linhas,
    linhasTruncadas: Boolean(o.linhasTruncadas),
  };
}

function normalizeDashboardResponse(
  raw: DashboardCompleteResponse,
): DashboardCompleteResponse {
  return {
    filters: {
      group: raw?.filters?.group ?? "",
      start: raw?.filters?.start ?? "",
      end: raw?.filters?.end ?? "",
      companyId: raw?.filters?.companyId ?? null,
    },
    summary: {
      totalChamados: Number(raw?.summary?.totalChamados ?? 0),
      totalTickets: Number(raw?.summary?.totalTickets ?? 0),
      totalOpenTickets: Number(raw?.summary?.totalOpenTickets ?? 0),
      totalHoras: Number(raw?.summary?.totalHoras ?? 0),
      totalHorasFormatadas:
        typeof (raw as unknown as { summary?: { totalHorasFormatadas?: unknown } })
          ?.summary?.totalHorasFormatadas === "string"
          ? (raw as unknown as { summary: { totalHorasFormatadas: string } })
              .summary.totalHorasFormatadas
          : "--",
      totalHigh: Number(raw?.summary?.totalHigh ?? 0),
      totalDisaster: Number(raw?.summary?.totalDisaster ?? 0),
      totalHosts: Number(raw?.summary?.totalHosts ?? 0),
      hostsAtivos: Number(raw?.summary?.hostsAtivos ?? 0),
      hostsInativos: Number(raw?.summary?.hostsInativos ?? 0),
    },
    chamadosPorMes: Array.isArray(raw?.chamadosPorMes) ? raw.chamadosPorMes : [],
    horasPorMes: Array.isArray(raw?.horasPorMes) ? raw.horasPorMes : [],
    alertasPorMes: Array.isArray(raw?.alertasPorMes) ? raw.alertasPorMes : [],
    alertasPorSemana: Array.isArray(raw?.alertasPorSemana)
      ? raw.alertasPorSemana.map((item) => ({
          weekKey: item?.weekKey ?? "",
          weekLabel: item?.weekLabel ?? "",
          High: Number(item?.High ?? 0),
          Disaster: Number(item?.Disaster ?? 0),
          Total: Number(item?.Total ?? 0),
        }))
      : [],
    principaisHostsPorMes: Array.isArray(raw?.principaisHostsPorMes)
      ? raw.principaisHostsPorMes.map((item) => ({
          monthKey: item?.monthKey ?? "",
          monthLabel: item?.monthLabel ?? "",
          High: Array.isArray(item?.High) ? item.High : [],
          Disaster: Array.isArray(item?.Disaster) ? item.Disaster : [],
        }))
      : [],
    topTriggers: Array.isArray(raw?.topTriggers) ? raw.topTriggers : [],
    hostsDetalhados: Array.isArray(raw?.hostsDetalhados) ? raw.hostsDetalhados : [],
    templates: Array.isArray(raw?.templates) ? raw.templates : [],
    eventosRecentes: Array.isArray(raw?.eventosRecentes) ? raw.eventosRecentes : [],
    resumoHorasTrabalhadas: normalizeWorkHoursSummary(
      (raw as { resumoHorasTrabalhadas?: unknown }).resumoHorasTrabalhadas,
    ),
  };
}

export default function DashboardPage() {
  const user = getStoredUser();

  const [dashboard, setDashboard] = useState<DashboardCompleteResponse | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    user?.companyId ?? null,
  );

  const [initialLoading, setInitialLoading] = useState(true);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [refreshCooldownUntil, setRefreshCooldownUntil] = useState(0);
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState(0);

  const isAdmin = user?.role === "ADMIN";

  const today = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 6);

  const [startDate, setStartDate] = useState(formatDateInput(sevenDaysAgo));
  const [endDate, setEndDate] = useState(formatDateInput(today));

  const completeRequestIdRef = useRef(0);
  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const chartTheme = useChartTheme();
  const TOOLTIP_PROPS = useChartTooltipProps(chartTheme);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const remaining = Math.max(refreshCooldownUntil - Date.now(), 0);
      setCooldownRemainingMs(remaining);
    }, 250);

    return () => window.clearInterval(timer);
  }, [refreshCooldownUntil]);

  useEffect(() => {
    if (!isAdmin) {
      setSelectedCompanyId(user?.companyId ?? null);
      setCompanies([]);
      return;
    }

    let active = true;

    async function loadCompanies() {
      try {
        const list = await companiesService.list();
        if (!active) {
          return;
        }

        const normalized = Array.isArray(list) ? list : [];
        setCompanies(normalized);

        if (!selectedCompanyId && normalized.length > 0) {
          setSelectedCompanyId(normalized[0].id);
        }
      } catch (err) {
        console.error(err);
        if (active) {
          setCompanies([]);
        }
      }
    }

    void loadCompanies();

    return () => {
      active = false;
    };
  }, [isAdmin, selectedCompanyId, user?.companyId]);

  const getEffectiveCompanyId = useCallback(() => {
    return isAdmin ? selectedCompanyId : user?.companyId ?? null;
  }, [isAdmin, selectedCompanyId, user?.companyId]);

  const loadDashboard = useCallback(
    async (mode: "initial" | "manual" | "auto" = "initial") => {
      const effectiveCompanyId = getEffectiveCompanyId();

      if (!effectiveCompanyId) {
        setError(
          isAdmin
            ? "Selecione uma empresa para visualizar o dashboard."
            : "Usuário sem empresa vinculada.",
        );
        setInitialLoading(false);
        setManualRefreshing(false);
        return;
      }

      if (mode === "manual" && Date.now() < refreshCooldownUntil) {
        return;
      }

      const requestId = completeRequestIdRef.current + 1;
      completeRequestIdRef.current = requestId;

      if (mode === "initial") {
        setInitialLoading(true);
      }

      if (mode === "manual") {
        setManualRefreshing(true);
        const nextCooldown = Date.now() + MANUAL_REFRESH_COOLDOWN_MS;
        setRefreshCooldownUntil(nextCooldown);
        setCooldownRemainingMs(MANUAL_REFRESH_COOLDOWN_MS);
      }

      try {
        setError("");

        const companyFromList = companies.find((c) => c.id === effectiveCompanyId);
        let groupName = companyFromList?.zabbixGroupName?.trim() ?? "";

        if (!groupName) {
          const company = await companiesService.getById(effectiveCompanyId);
          groupName = company.zabbixGroupName?.trim() ?? "";
        }

        if (!groupName) {
          if (requestId === completeRequestIdRef.current) {
            setError("A empresa selecionada não possui integração configurada.");
            setDashboard(null);
          }
          return;
        }

        const requestParams = {
          group: groupName,
          start: toRangeDateString(startDate, false),
          end: toRangeDateString(endDate, true),
          companyId: effectiveCompanyId,
        };

        if (!isValidDateInput(startDate) || !isValidDateInput(endDate)) {
          if (requestId === completeRequestIdRef.current) {
            setError("Período inválido. Verifique a data inicial e a data final.");
            setDashboard(null);
          }
          return;
        }

        const data =
          mode === "manual"
            ? await refreshCompleteDashboard(requestParams)
            : await getCompleteDashboard(requestParams);

        if (requestId !== completeRequestIdRef.current) {
          return;
        }

        const normalized = normalizeDashboardResponse(data);

        if (!normalized.horasPorMes.length) {
          normalized.horasPorMes = buildEmptyHoursRows(
            normalized.filters.start,
            normalized.filters.end,
          );
        }

        setDashboard((previous) => {
          if (!previous) {
            return normalized;
          }

          // Se o /complete falhar parcialmente nas horas (ex.: timeout) mas já tínhamos dados,
          // mantém o último apontamento na mesma empresa para não regredir a UI no auto-refresh.
          const sameCompany =
            String(previous.filters.companyId ?? "") ===
            String(normalized.filters.companyId ?? "");

          const shouldPreserveHours =
            sameCompany &&
            Number(normalized.summary.totalHoras ?? 0) === 0 &&
            Number(previous.summary.totalHoras ?? 0) > 0;

          const prevResumo = previous.resumoHorasTrabalhadas;
          const normResumo = normalized.resumoHorasTrabalhadas;
          const shouldPreserveResumo =
            sameCompany &&
            (!normResumo || normResumo.linhas.length === 0) &&
            (prevResumo?.linhas?.length ?? 0) > 0;

          if (!shouldPreserveHours && !shouldPreserveResumo) {
            return normalized;
          }

          return {
            ...normalized,
            summary: {
              ...normalized.summary,
              totalHoras: shouldPreserveHours
                ? previous.summary.totalHoras
                : normalized.summary.totalHoras,
              totalHorasFormatadas: shouldPreserveHours
                ? previous.summary.totalHorasFormatadas
                : normalized.summary.totalHorasFormatadas,
            },
            horasPorMes:
              shouldPreserveHours &&
              Array.isArray(previous.horasPorMes) &&
              previous.horasPorMes.length
                ? previous.horasPorMes
                : normalized.horasPorMes,
            resumoHorasTrabalhadas: shouldPreserveResumo
              ? previous.resumoHorasTrabalhadas
              : normalized.resumoHorasTrabalhadas,
          };
        });
      } catch (err) {
        if (requestId !== completeRequestIdRef.current) {
          return;
        }

        const message =
          err instanceof Error
            ? err.message
            : "Não foi possível carregar o dashboard.";

        setError(message);
        setDashboard(null);
      } finally {
        if (requestId === completeRequestIdRef.current) {
          setInitialLoading(false);
          setManualRefreshing(false);
        }
      }
    },
    [companies, endDate, getEffectiveCompanyId, isAdmin, refreshCooldownUntil, startDate],
  );

  useEffect(() => {
    void loadDashboard("initial");
  }, [loadDashboard]);

  useEffect(() => {
    if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current);
    }

    autoRefreshTimerRef.current = setInterval(() => {
      void loadDashboard("auto");
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
    };
  }, [loadDashboard]);

  const chamadosChartData = useMemo<DashboardChamadosMes[]>(() => {
    return dashboard?.chamadosPorMes ?? [];
  }, [dashboard]);

  const horasChartData = useMemo<DashboardHorasMes[]>(() => {
    return dashboard?.horasPorMes ?? [];
  }, [dashboard]);

  const alertasChartData = useMemo<DashboardAlertasMes[]>(() => {
    return dashboard?.alertasPorMes ?? [];
  }, [dashboard]);

  const alertasChartWeeklyData = useMemo<DashboardAlertasSemana[]>(() => {
    const weekly = dashboard?.alertasPorSemana;
    if (weekly && weekly.length > 0) {
      return weekly;
    }
    return (dashboard?.alertasPorMes ?? []).map((row) => ({
      weekKey: row.monthKey,
      weekLabel: row.monthLabel,
      High: row.High,
      Disaster: row.Disaster,
      Total: row.Total,
    }));
  }, [dashboard]);

  const hostsPorMes = useMemo<DashboardTopHostsMes[]>(() => {
    return dashboard?.principaisHostsPorMes ?? [];
  }, [dashboard]);

  const topTriggers = useMemo<DashboardTopTrigger[]>(() => {
    return dashboard?.topTriggers ?? [];
  }, [dashboard]);

  const refreshButtonDisabled =
    initialLoading || manualRefreshing || cooldownRemainingMs > 0;

  const refreshButtonLabel = manualRefreshing
    ? "Atualizando..."
    : cooldownRemainingMs > 0
      ? `Aguarde ${Math.ceil(cooldownRemainingMs / 1000)}s`
      : "Atualizar";

  return (
    <ProtectedPage>
      <PermissionGate module="DASHBOARD">
      <AppShell>
        <div className="font-sans w-full space-y-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold">Dashboard</h1>
              <p className="text-muted-foreground">Tudo sobre seu ambiente.</p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end xl:w-auto">
              {isAdmin ? (
                <div className="w-full rounded-xl border border-border bg-card px-4 py-3 sm:min-w-[320px]">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Empresa
                  </p>
                  <select
                    value={selectedCompanyId ?? ""}
                    onChange={(e) =>
                      setSelectedCompanyId(e.target.value ? e.target.value : null)
                    }
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-1 ring-transparent transition focus:ring-ring/50"
                  >
                    <option value="">
                      {companies.length === 0 ? "Carregando..." : "Selecione uma empresa"}
                    </option>
                    {companies.map((company) => (
                      <option
                        key={company.id}
                        value={company.id}
                      >
                        {company.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Data inicial
                </p>
                <DatePickerField
                  value={startDate}
                  onChange={setStartDate}
                  max={endDate || undefined}
                />
              </div>

              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Data final
                </p>
                <DatePickerField
                  value={endDate}
                  onChange={setEndDate}
                  min={startDate || undefined}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
            <div className="inline-flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Building2 size={18} />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {isAdmin ? "Empresa selecionada" : "Empresa logada"}
                </p>
                <div className="mt-1 flex items-center gap-3">
                  <p className="text-sm font-bold">
                    {isAdmin
                      ? companies.find((c) => c.id === selectedCompanyId)?.name ??
                        "Selecione uma empresa"
                      : user?.companyName ?? "Empresa não vinculada"}
                  </p>
                </div>
              </div>
            </div>

            <Button
              onClick={() => void loadDashboard("manual")}
              disabled={refreshButtonDisabled}
              className="h-10 gap-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw size={16} className={manualRefreshing ? "animate-spin" : ""} />
              {refreshButtonLabel}
            </Button>
          </div>

          {error ? (
            <div className="alle-alert-error rounded-2xl p-6 text-sm">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-6">
            <MetricCard
              title="Total de tickets"
              value={
                initialLoading
                  ? "--"
                  : dashboard?.resumoHorasTrabalhadas != null
                    ? dashboard.resumoHorasTrabalhadas.totalTicketsDistintos
                    : (dashboard?.summary.totalTickets ?? 0)
              }
              icon={<Ticket size={18} className="text-primary" />}
            />
            <MetricCard
              title="Tickets em aberto"
              value={initialLoading ? "--" : dashboard?.summary.totalOpenTickets ?? 0}
              icon={<Ticket size={18} className="text-orange-400" />}
            />
            <MetricCard
              title="Horas apontadas"
              value={
                initialLoading
                  ? "--"
                  : dashboard?.resumoHorasTrabalhadas != null
                    ? dashboard.resumoHorasTrabalhadas.totalHorasFormatadas
                    : (dashboard?.summary.totalHorasFormatadas ??
                      dashboard?.summary.totalHoras ??
                      0)
              }
              icon={<Clock3 size={18} className="text-primary" />}
            />
            <MetricCard
              title="Alertas High"
              value={initialLoading ? "--" : dashboard?.summary.totalHigh ?? 0}
              icon={<AlertCircle size={18} className="text-orange-400" />}
            />
            <MetricCard
              title="Alertas Disaster"
              value={initialLoading ? "--" : dashboard?.summary.totalDisaster ?? 0}
              icon={<ShieldAlert size={18} className="text-destructive" />}
            />
            <MetricCard
              title="Hosts totais"
              value={initialLoading ? "--" : dashboard?.summary.totalHosts ?? 0}
              icon={<Server size={18} className="text-primary" />}
            />
          </div>

          <Card className="border border-border bg-card text-card-foreground">
            <CardHeader>
              <CardTitle>Chamados por mês</CardTitle>
              <CardDescription>
                Gráfico por criação do ticket. Abaixo: apontamentos no período do filtro (totais
                alinhados aos cartões de tickets/horas quando existirem dados de apontamento).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="min-w-[1020px] w-full text-left text-sm">
                  <thead className="bg-primary/15 text-foreground">
                    <tr>
                      <th className="px-4 py-3">Mês</th>
                      <th className="px-4 py-3">Infraestrutura</th>
                      <th className="px-4 py-3">Sistema</th>
                      <th className="px-4 py-3">NOC</th>
                      <th className="px-4 py-3">Rotinas</th>
                      <th className="px-4 py-3">Consult</th>
                      <th className="px-4 py-3">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chamadosChartData.map((row) => (
                      <tr key={row.monthKey} className="border-t border-border/60">
                        <td className="px-4 py-3">{row.monthLabel}</td>
                        <td className="px-4 py-3">{row.Infraestrutura}</td>
                        <td className="px-4 py-3">{row.Sistema}</td>
                        <td className="px-4 py-3">{row.NOC}</td>
                        <td className="px-4 py-3">{row.Rotinas}</td>
                        <td className="px-4 py-3">{row.Consult ?? 0}</td>
                        <td className="px-4 py-3 font-bold text-primary">
                          {row.Total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="h-[360px]">
                <DeferredResponsiveContainer width="100%" height="100%">
                  <BarChart data={chamadosChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                    <XAxis
                      dataKey="monthLabel"
                      stroke={chartTheme.tick}
                      tick={{ fill: chartTheme.tick }}
                      tickLine={{ stroke: chartTheme.tick }}
                      axisLine={{ stroke: chartTheme.grid }}
                    />
                    <YAxis
                      stroke={chartTheme.tick}
                      tick={{ fill: chartTheme.tick }}
                      tickLine={{ stroke: chartTheme.tick }}
                      axisLine={{ stroke: chartTheme.grid }}
                    />
                    <Tooltip {...TOOLTIP_PROPS} />
                    <Legend
                      wrapperStyle={{ color: chartTheme.tick }}
                      formatter={(value: string) =>
                        <span style={{ color: chartTheme.tick }}>{value}</span>
                      }
                    />
                    <Bar dataKey="Infraestrutura" fill="#4f8bd6" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Sistema" fill="#d85c57" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="NOC" fill="#8c6fd1" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Rotinas" fill="#9bc45b" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Consult" fill="#ed7d31" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Total" fill="#57c1d9" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </DeferredResponsiveContainer>
              </div>

              {dashboard?.resumoHorasTrabalhadas ? (
                <div className="space-y-4 border-t border-border pt-6">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Apontamentos no período
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Resumo agregado (totais no período filtrado).
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    <div className="rounded-lg border border-border bg-muted/25 px-3 py-2 text-center">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                        Tickets (apont.)
                      </p>
                      <p className="text-lg font-bold">
                        {dashboard.resumoHorasTrabalhadas.totalTicketsDistintos}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/25 px-3 py-2 text-center">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                        Total horas
                      </p>
                      <p className="text-lg font-bold">
                        {dashboard.resumoHorasTrabalhadas.totalHorasFormatadas}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/25 px-3 py-2 text-center">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                        Sem assist.
                      </p>
                      <p className="text-lg font-bold">
                        {dashboard.resumoHorasTrabalhadas.semAssistenciaFormatado}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/25 px-3 py-2 text-center">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                        Externo
                      </p>
                      <p className="text-lg font-bold">
                        {dashboard.resumoHorasTrabalhadas.externoFormatado}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/25 px-3 py-2 text-center">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                        Remoto
                      </p>
                      <p className="text-lg font-bold">
                        {dashboard.resumoHorasTrabalhadas.remotoFormatado}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/25 px-3 py-2 text-center">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                        Interno
                      </p>
                      <p className="text-lg font-bold">
                        {dashboard.resumoHorasTrabalhadas.internoFormatado}
                      </p>
                    </div>
                  </div>

                  {dashboard.resumoHorasTrabalhadas.linhasTruncadas ? (
                    <p className="text-xs text-amber-500/90">
                      O resumo considerou no máximo {dashboard.resumoHorasTrabalhadas.limiteLinhas}{" "}
                      apontamentos na soma. Ajuste TIFLUX_RESUMO_MAX_LINHAS no backend se precisar do
                      total completo.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border border-border bg-card text-card-foreground">
            <CardHeader>
              <CardTitle>Apontamento de horas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="min-w-[1020px] w-full text-left text-sm">
                  <thead className="bg-primary/15 text-foreground">
                    <tr>
                      <th className="px-4 py-3">Mês</th>
                      <th className="px-4 py-3">Infraestrutura</th>
                      <th className="px-4 py-3">Sistema</th>
                      <th className="px-4 py-3">NOC</th>
                      <th className="px-4 py-3">Rotinas</th>
                      <th className="px-4 py-3">Consult</th>
                      <th className="px-4 py-3">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {horasChartData.map((row) => (
                      <tr key={row.monthKey} className="border-t border-border/60">
                        <td className="px-4 py-3">{row.monthLabel}</td>
                        <td className="px-4 py-3">{row.Infraestrutura}</td>
                        <td className="px-4 py-3">{row.Sistema}</td>
                        <td className="px-4 py-3">{row.NOC}</td>
                        <td className="px-4 py-3">{row.Rotinas}</td>
                        <td className="px-4 py-3">{row.Consult ?? 0}</td>
                        <td className="px-4 py-3 font-bold text-primary">
                          {row.Total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="h-[360px]">
                <DeferredResponsiveContainer width="100%" height="100%">
                  <BarChart data={horasChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                    <XAxis
                      dataKey="monthLabel"
                      stroke={chartTheme.tick}
                      tick={{ fill: chartTheme.tick }}
                      tickLine={{ stroke: chartTheme.tick }}
                      axisLine={{ stroke: chartTheme.grid }}
                    />
                    <YAxis
                      stroke={chartTheme.tick}
                      tick={{ fill: chartTheme.tick }}
                      tickLine={{ stroke: chartTheme.tick }}
                      axisLine={{ stroke: chartTheme.grid }}
                    />
                    <Tooltip {...TOOLTIP_PROPS} />
                    <Legend
                      wrapperStyle={{ color: chartTheme.tick }}
                      formatter={(value: string) =>
                        <span style={{ color: chartTheme.tick }}>{value}</span>
                      }
                    />
                    <Bar dataKey="Infraestrutura" fill="#4f8bd6" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Sistema" fill="#d85c57" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="NOC" fill="#8c6fd1" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Rotinas" fill="#9bc45b" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Consult" fill="#ed7d31" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Total" fill="#57c1d9" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </DeferredResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border bg-card text-card-foreground">
            <CardHeader>
              <CardTitle>Monitoramento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="min-w-[760px] w-full text-left text-sm">
                  <thead className="bg-primary/15 text-foreground">
                    <tr>
                      <th className="px-4 py-3">Mês</th>
                      <th className="px-4 py-3">High</th>
                      <th className="px-4 py-3">Disaster</th>
                      <th className="px-4 py-3">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertasChartData.map((row) => (
                      <tr key={row.monthKey} className="border-t border-border/60">
                        <td className="px-4 py-3">{row.monthLabel}</td>
                        <td className="px-4 py-3">{row.High}</td>
                        <td className="px-4 py-3">{row.Disaster}</td>
                        <td className="px-4 py-3 font-bold text-primary">
                          {row.Total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="h-[360px]">
                <DeferredResponsiveContainer width="100%" height="100%">
                  <LineChart data={alertasChartWeeklyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                    <XAxis
                      dataKey="weekLabel"
                      stroke={chartTheme.tick}
                      tick={{ fill: chartTheme.tick, fontSize: 11 }}
                      tickLine={{ stroke: chartTheme.tick }}
                      axisLine={{ stroke: chartTheme.grid }}
                      interval={0}
                      angle={alertasChartWeeklyData.length > 4 ? -25 : 0}
                      textAnchor={
                        alertasChartWeeklyData.length > 4 ? "end" : "middle"
                      }
                      height={alertasChartWeeklyData.length > 4 ? 56 : 30}
                    />
                    <YAxis
                      stroke={chartTheme.tick}
                      tick={{ fill: chartTheme.tick }}
                      tickLine={{ stroke: chartTheme.tick }}
                      axisLine={{ stroke: chartTheme.grid }}
                    />
                    <Tooltip {...TOOLTIP_PROPS} />
                    <Legend
                      wrapperStyle={{ color: chartTheme.tick }}
                      formatter={(value: string) =>
                        <span style={{ color: chartTheme.tick }}>{value}</span>
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="High"
                      stroke="#4f8bd6"
                      strokeWidth={2}
                      dot={{ r: 5, strokeWidth: 2, fill: "#4f8bd6" }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Disaster"
                      stroke="#d85c57"
                      strokeWidth={2}
                      dot={{ r: 5, strokeWidth: 2, fill: "#d85c57" }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </DeferredResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border bg-card text-card-foreground">
            <CardHeader>
              <CardTitle>Principais hosts por mês</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                {hostsPorMes.map((month) => (
                  <div
                    key={month.monthKey}
                    className="overflow-hidden rounded-2xl border border-border"
                  >
                    <div className="bg-primary/15 px-4 py-3 text-xl font-bold text-foreground">
                      {month.monthLabel}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2">
                      <div className="border-r border-border">
                        <div className="bg-muted/60 px-4 py-3 font-bold text-foreground">
                          High
                        </div>
                        {(month.High.length ? month.High : [{ host: "--", quantity: 0 }]).map(
                          (item, index) => (
                            <div
                              key={`${month.monthKey}-high-${index}`}
                              className="flex items-center justify-between border-t border-border/60 px-4 py-3"
                            >
                              <span className="text-muted-foreground">{item.host}</span>
                              <span className="font-bold text-foreground">
                                {item.quantity}
                              </span>
                            </div>
                          ),
                        )}
                      </div>

                      <div>
                        <div className="bg-muted/60 px-4 py-3 font-bold text-foreground">
                          Disaster
                        </div>
                        {(month.Disaster.length
                          ? month.Disaster
                          : [{ host: "--", quantity: 0 }]).map((item, index) => (
                          <div
                            key={`${month.monthKey}-disaster-${index}`}
                            className="flex items-center justify-between border-t border-border/60 px-4 py-3"
                          >
                            <span className="text-muted-foreground">{item.host}</span>
                            <span className="font-bold text-foreground">
                              {item.quantity}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border bg-card text-card-foreground">
            <CardHeader>
              <CardTitle>Top 20 triggers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="min-w-[1100px] w-full text-left text-sm">
                  <thead className="bg-muted/60 text-foreground">
                    <tr>
                      <th className="px-4 py-3">Host</th>
                      <th className="px-4 py-3">Trigger</th>
                      <th className="px-4 py-3">Severity</th>
                      <th className="px-4 py-3">Número de problemas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topTriggers.map((row, index) => (
                      <tr
                        key={`${row.host}-${row.trigger}-${index}`}
                        className="border-t border-border/60"
                      >
                        <td className="px-4 py-3 text-muted-foreground">{row.host}</td>
                        <td className="px-4 py-3 text-muted-foreground">{row.trigger}</td>
                        <td
                          className={`px-4 py-3 font-bold ${
                            row.severity === "Disaster"
                              ? "text-destructive"
                              : "text-amber-800 dark:text-yellow-300"
                          }`}
                        >
                          {row.severity}
                        </td>
                        <td className="px-4 py-3 font-bold text-foreground">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}