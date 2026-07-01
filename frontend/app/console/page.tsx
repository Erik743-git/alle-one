"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  Clock3,
  Loader2,
  MonitorDot,
  Pause,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";

import AppShell from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { ConsoleProblemsWidget } from "@/components/console/console-problems-widget";
import {
  getSeverityAccent,
  getZabbixSeverityLabel,
  severityBadgeStyle,
} from "@/components/console/console-severity";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  canAcknowledgeConsoleAlerts,
  isClient,
} from "@/lib/access-control";
import { notifyError, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  acknowledgeConsoleAlert,
  formatConsoleClock,
  formatConsoleDuration,
  getConsoleAlerts,
  getConsoleGroups,
  type ConsoleAlert,
  type ConsoleAlertsResponse,
  type ConsoleGroupOption,
} from "@/lib/services/console.service";

const REFRESH_OPTIONS = [
  { label: "5s", value: "5000" },
  { label: "15s", value: "15000" },
  { label: "30s", value: "30000" },
  { label: "60s", value: "60000" },
  { label: "Pausado", value: "0" },
];

const SEVERITY_FILTERS = [
  { label: "Todas", value: "" },
  { label: "Desastre", value: "5" },
  { label: "Alta", value: "4" },
  { label: "Média", value: "3" },
  { label: "Atenção", value: "2" },
  { label: "Informação", value: "1" },
];

const ACK_FILTERS = [
  { label: "Todos", value: "all" },
  { label: "Reconhecidos", value: "yes" },
  { label: "Não reconhecidos", value: "no" },
];

function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function PriorityStat({
  severity,
  count,
}: {
  severity: number;
  count: number;
}) {
  const accent = getSeverityAccent(severity);
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 12%, var(--card)), var(--card) 70%)`,
      }}
    >
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: accent }}
        aria-hidden
      />
      <p className="text-2xl font-bold tabular-nums text-foreground">{count}</p>
      <p className="mt-0.5 text-xs font-medium text-muted-foreground">
        {getZabbixSeverityLabel(severity)}
      </p>
    </div>
  );
}

export default function ConsolePage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groups, setGroups] = useState<ConsoleGroupOption[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [ackFilter, setAckFilter] = useState<"all" | "yes" | "no">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [refreshInterval, setRefreshInterval] = useState(15000);
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [data, setData] = useState<ConsoleAlertsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<ConsoleAlert | null>(null);
  const [ackTarget, setAckTarget] = useState<ConsoleAlert | null>(null);
  const [ackMessage, setAckMessage] = useState("");
  const [ackSubmitting, setAckSubmitting] = useState(false);

  const fetchSeq = useRef(0);
  const hasLoadedOnce = useRef(false);
  const showGroupPicker = !isClient();
  const canAck = canAcknowledgeConsoleAlerts();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadGroups = useCallback(async () => {
    try {
      const response = await getConsoleGroups();
      const list = response.groups ?? [];
      setGroups(list);
      if (list.length >= 1) {
        const preferred =
          list.find((item) => item.isPriority)?.name ?? list[0].name;
        setSelectedGroup((current) => current || preferred);
      }
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar grupos Zabbix.",
      );
    }
  }, []);

  const fetchAlerts = useCallback(
    async (silent = false) => {
      if (!priorityOnly && showGroupPicker && !selectedGroup) {
        setLoading(false);
        return;
      }

      const seq = ++fetchSeq.current;
      if (!silent && !hasLoadedOnce.current) setLoading(true);
      if (!silent) setRefreshing(true);

      try {
        const response = await getConsoleAlerts({
          group: priorityOnly ? undefined : selectedGroup || undefined,
          severity: severityFilter || undefined,
          ack: ackFilter,
          search: debouncedSearch || undefined,
          limit: 500,
          priorityOnly,
        });
        if (seq !== fetchSeq.current) return;
        setData(response);
        setError(null);
      } catch (err) {
        if (seq !== fetchSeq.current) return;
        setError(
          err instanceof Error ? err.message : "Falha ao consultar alertas.",
        );
        if (!silent)
          notifyError(
            err instanceof Error
              ? err.message
              : "Erro ao carregar alertas do Zabbix.",
          );
      } finally {
        if (seq === fetchSeq.current) {
          hasLoadedOnce.current = true;
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [
      ackFilter,
      debouncedSearch,
      priorityOnly,
      selectedGroup,
      severityFilter,
      showGroupPicker,
    ],
  );

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    void fetchAlerts(!hasLoadedOnce.current);
  }, [fetchAlerts]);

  useEffect(() => {
    if (refreshInterval <= 0) return;
    const timer = window.setInterval(() => void fetchAlerts(true), refreshInterval);
    return () => window.clearInterval(timer);
  }, [fetchAlerts, refreshInterval]);

  const groupOptions = useMemo(
    () =>
      groups.map((g) => ({
        value: g.name,
        label: g.isPriority ? `★ ${g.name}` : g.name,
        description: g.companyName
          ? g.isPriority
            ? `${g.companyName} · prioritária no Console`
            : g.companyName
          : g.isPriority
            ? "Empresa prioritária no Console"
            : "Sem empresa vinculada no portal",
      })),
    [groups],
  );

  const refreshLabel = useMemo(() => {
    if (refreshInterval <= 0) return "Atualização pausada";
    const seconds = refreshInterval / 1000;
    return `Atualização automática a cada ${seconds}s (consulta à API Zabbix)`;
  }, [refreshInterval]);

  const priorityCompanyAlerts = useMemo(
    () => data?.priorityAlerts ?? [],
    [data?.priorityAlerts],
  );
  const allAlerts = useMemo(() => data?.alerts ?? [], [data?.alerts]);

  const severityCounts = useMemo(() => {
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const alert of allAlerts) {
      counts[alert.severity] = (counts[alert.severity] ?? 0) + 1;
    }
    return counts;
  }, [allAlerts]);

  const handleAck = async () => {
    if (!ackTarget) return;
    setAckSubmitting(true);
    try {
      await acknowledgeConsoleAlert(ackTarget.eventId, {
        message: ackMessage.trim() || undefined,
        group:
          ackTarget.groupName ||
          data?.group ||
          selectedGroup ||
          undefined,
      });
      notifySuccess("Alerta reconhecido no Zabbix.");
      setAckTarget(null);
      setAckMessage("");
      await fetchAlerts(true);
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível reconhecer o alerta.",
      );
    } finally {
      setAckSubmitting(false);
    }
  };

  const lastUpdate = data?.fetchedAt
    ? new Date(data.fetchedAt).toLocaleTimeString("pt-BR")
    : null;

  return (
    <ProtectedPage>
      <PermissionGate module="MONITORING">
        <AppShell>
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
            <PageHeader
              icon={<MonitorDot className="size-6" />}
              title="Console"
              description="Visão operacional dos alertas do Zabbix com atualização automática. Consulta direta à API do Zabbix — não é WebSocket em tempo real."
              actions={
                <div className="flex flex-col items-end gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      refreshing ||
                      (!priorityOnly && showGroupPicker && !selectedGroup)
                    }
                    onClick={() => void fetchAlerts()}
                  >
                    {refreshing ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 size-4" />
                    )}
                    Atualizar
                  </Button>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {error ? (
                      <span className="text-destructive">{error}</span>
                    ) : lastUpdate ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="size-3" /> Atualizado {lastUpdate}
                      </span>
                    ) : null}
                    {refreshInterval === 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Pause className="size-3" /> pausado
                      </span>
                    )}
                  </div>
                </div>
              }
            />

            {/* Resumo por severidade */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[5, 4, 3, 2, 1, 0].map((sev) => (
                <PriorityStat
                  key={sev}
                  severity={sev}
                  count={severityCounts[sev] ?? 0}
                />
              ))}
            </div>

            {/* Filtros */}
            <Card>
              <CardContent className="flex flex-col gap-4 py-4">
                {(showGroupPicker || groups.length > 1) && (
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <FilterField label="Grupo Zabbix" className="min-w-0">
                      <SearchableSelectField
                        value={selectedGroup}
                        onChange={setSelectedGroup}
                        options={groupOptions}
                        placeholder="Selecione o grupo"
                        searchPlaceholder="Buscar grupo…"
                        disabled={priorityOnly}
                        preserveOrder
                        alwaysShowSearch
                        popoverMinWidth="min-w-[min(42rem,calc(100vw-2rem))]"
                      />
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Grupos com ★ pertencem a empresas marcadas como
                        prioritárias em{" "}
                        <span className="font-medium text-foreground">
                          Admin → Empresas
                        </span>
                        .
                      </p>
                    </FilterField>

                    {showGroupPicker ? (
                      <FilterField label="Visão de empresas prioritárias">
                        <SearchableSelectField
                          value={priorityOnly ? "yes" : "no"}
                          onChange={(value) => setPriorityOnly(value === "yes")}
                          options={[
                            { value: "no", label: "Um grupo por vez" },
                            {
                              value: "yes",
                              label: "Todos os alertas de empresas prioritárias",
                            },
                          ]}
                          preserveOrder
                        />
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Prioridade é definida por empresa, não por grupo
                          isolado no Zabbix.
                        </p>
                      </FilterField>
                    ) : null}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <FilterField label="Severidade">
                  <SearchableSelectField
                    value={severityFilter}
                    onChange={setSeverityFilter}
                    options={SEVERITY_FILTERS}
                    placeholder="Todas"
                    preserveOrder
                  />
                </FilterField>

                <FilterField label="Reconhecimento">
                  <SearchableSelectField
                    value={ackFilter}
                    onChange={(v) => setAckFilter(v as "all" | "yes" | "no")}
                    options={ACK_FILTERS}
                    placeholder="Todos"
                    preserveOrder
                  />
                </FilterField>

                <FilterField label="Auto refresh">
                  <SearchableSelectField
                    value={String(refreshInterval)}
                    onChange={(v) => setRefreshInterval(Number(v))}
                    options={REFRESH_OPTIONS}
                    placeholder="15s"
                    preserveOrder
                  />
                  <p className="text-xs text-muted-foreground">{refreshLabel}</p>
                </FilterField>

                <FilterField label="Busca" className="sm:col-span-2 lg:col-span-1">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Host ou problema…"
                      className="pl-9"
                    />
                  </div>
                </FilterField>
                </div>
              </CardContent>
            </Card>

            {loading && !data ? (
              <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                Carregando problemas…
              </div>
            ) : !priorityOnly && showGroupPicker && !selectedGroup ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
                  <Activity className="size-8 opacity-50" />
                  <p>Selecione um grupo Zabbix para visualizar os alertas.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-5">
                {data?.warnings?.length ? (
                  <div className="alle-alert-error rounded-xl px-4 py-3 text-sm">
                    {data.warnings.join(" ")}
                  </div>
                ) : null}

                <ConsoleProblemsWidget
                  title="Empresas prioritárias"
                  accent="danger"
                  alerts={priorityCompanyAlerts}
                  emptyLabel="Nenhum alerta de empresas marcadas como prioritárias."
                  onSelectAlert={setSelectedAlert}
                  onAckAlert={setAckTarget}
                  canAck={canAck}
                />

                <ConsoleProblemsWidget
                  title="Todos os alertas"
                  alerts={allAlerts}
                  emptyLabel="Nenhum problema ativo."
                  onSelectAlert={setSelectedAlert}
                  onAckAlert={setAckTarget}
                  canAck={canAck}
                />
              </div>
            )}
          </div>

          <Sheet
            open={selectedAlert !== null}
            onOpenChange={(open) => !open && setSelectedAlert(null)}
          >
            <SheetContent className="w-full overflow-y-auto sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Detalhe do problema</SheetTitle>
                <SheetDescription>
                  Consulta em tempo real — não persistido no portal.
                </SheetDescription>
              </SheetHeader>
              {selectedAlert ? (
                <div className="mt-6 space-y-5 px-4 text-sm sm:px-0">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-1 h-full w-1 shrink-0 self-stretch rounded-full"
                      style={{
                        backgroundColor: getSeverityAccent(selectedAlert.severity),
                      }}
                      aria-hidden
                    />
                    <div className="space-y-2">
                      <span
                        className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                        style={severityBadgeStyle(selectedAlert.severity)}
                      >
                        {getZabbixSeverityLabel(selectedAlert.severity)}
                      </span>
                      <p className="font-medium leading-snug text-foreground">
                        {selectedAlert.name}
                      </p>
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                        Host
                      </dt>
                      <dd className="mt-0.5 font-medium text-foreground">
                        {selectedAlert.hostName ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                        Empresa
                      </dt>
                      <dd className="mt-0.5 font-medium text-foreground">
                        {selectedAlert.companyName ?? selectedAlert.groupName}
                        {selectedAlert.isPriorityCompany ? " ★" : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                        Grupo
                      </dt>
                      <dd className="mt-0.5 text-foreground">
                        {selectedAlert.groupName}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                        Início
                      </dt>
                      <dd className="mt-0.5 tabular-nums text-foreground">
                        {formatConsoleClock(selectedAlert.clock)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                        Duração
                      </dt>
                      <dd className="mt-0.5 tabular-nums text-foreground">
                        {formatConsoleDuration(selectedAlert.durationSeconds)}
                      </dd>
                    </div>
                  </dl>

                  {selectedAlert.tags.length > 0 ? (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Tags
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {selectedAlert.tags.map((tag) => (
                          <li
                            key={`${tag.tag}-${tag.value}`}
                            className="rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground"
                          >
                            {tag.tag}
                            {tag.value ? `: ${tag.value}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {selectedAlert.acknowledged ? (
                    <p className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-500">
                      <ShieldCheck className="size-4" /> Já reconhecido
                    </p>
                  ) : canAck ? (
                    <Button
                      type="button"
                      onClick={() => setAckTarget(selectedAlert)}
                    >
                      Reconhecer problema
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </SheetContent>
          </Sheet>

          <Dialog
            open={ackTarget !== null}
            onOpenChange={(open) => {
              if (!open) {
                setAckTarget(null);
                setAckMessage("");
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reconhecer problema</DialogTitle>
                <DialogDescription>
                  O reconhecimento é enviado diretamente ao Zabbix via API.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {ackTarget ? (
                  <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3">
                    <span
                      className="mt-0.5 h-full w-1 shrink-0 self-stretch rounded-full"
                      style={{
                        backgroundColor: getSeverityAccent(ackTarget.severity),
                      }}
                      aria-hidden
                    />
                    <p className="text-sm leading-snug text-foreground">
                      {ackTarget.name}
                    </p>
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="ack-message">Mensagem</Label>
                  <Textarea
                    id="ack-message"
                    value={ackMessage}
                    onChange={(e) => setAckMessage(e.target.value)}
                    placeholder="Comentário do reconhecimento…"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setAckTarget(null);
                    setAckMessage("");
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={ackSubmitting}
                  onClick={() => void handleAck()}
                >
                  {ackSubmitting ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : null}
                  Confirmar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
