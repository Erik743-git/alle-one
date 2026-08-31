"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/layout/app-shell";
import { isClientPortalRole } from "@/lib/app-roles";
import { CompanyAgendaPanel } from "@/components/financeiro/company-agenda-panel";
import {
  CompanyPendingQuestionsDialog,
  PendingQuestionsBadge,
} from "@/components/rendimento/company-pending-questions-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Building2,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { useAuth } from "@/lib/use-auth";
import {
  FINANCEIRO_ADMIN_AGENDA_SUBTITLE,
  FINANCEIRO_CLIENT_AGENDA_SUBTITLE,
  FINANCEIRO_CLIENT_AGENDA_TITLE,
} from "@/lib/module-copy";
import { companiesService, type Company } from "@/lib/services/companies.service";
import {
  type CompanyContract,
  type ContractStatus,
} from "@/lib/services/company-contracts.service";
import {
  financialService,
  type FinancialOverviewResponse,
} from "@/lib/services/financial.service";
import {
  rendimentoService,
  type RendimentoCompany,
  type RendimentoCompanyAgenda,
} from "@/lib/services/rendimento.service";
import {
  getPersistedCompanyId,
  isValidCompanyUuid,
  pickCompanyIdFromList,
  setPersistedCompanyId,
} from "@/lib/selected-company";
import { ensureArray, cn } from "@/lib/utils";

function moneyNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatBrl(value: number): string {
  return `R$ ${value.toFixed(2)}`;
}

function contractListedHours(contract: {
  monthlyHours: number;
  specialties?: Array<{ monthlyHours: number; unlimited?: boolean }>;
}): number {
  const lines = contract.specialties ?? [];
  if (lines.length > 0) {
    return lines.reduce(
      (sum, line) => sum + (line.unlimited ? 0 : line.monthlyHours),
      0,
    );
  }
  return Number(contract.monthlyHours) || 0;
}

function contractListedRate(contract: {
  extraHourPrice: unknown;
  specialties?: Array<{ unlimited?: boolean; excessHourPrice: unknown }>;
}): number | null {
  const billed = (contract.specialties ?? []).filter((line) => !line.unlimited);
  if (billed.length > 0) {
    const prices = billed
      .map((line) => moneyNumber(line.excessHourPrice))
      .filter((n): n is number => n != null);
    if (prices.length === 0) return null;
    const first = prices[0];
    return prices.every((price) => price === first) ? first : null;
  }
  return moneyNumber(contract.extraHourPrice);
}

function contractStatusLabel(status: ContractStatus): string {
  switch (status) {
    case "ACTIVE":
      return "Ativo";
    case "INACTIVE":
      return "Inativo";
    case "EXPIRED":
      return "Expirado";
    default:
      return status;
  }
}

function formatSpecialtyLineSummary(
  line: NonNullable<CompanyContract["specialties"]>[number],
): string {
  const name = line.specialty?.name?.trim() || "Especialidade";
  if (line.unlimited) {
    return `${name} · ilimitado`;
  }
  const rate = moneyNumber(line.excessHourPrice);
  const hours = `${line.monthlyHours}h/mês`;
  return rate == null ? `${name} · ${hours}` : `${name} · ${hours} · excedente ${formatBrl(rate)}`;
}

export default function FinanceiroPage() {
  const { user } = useAuth();
  const isClient = isClientPortalRole(user?.role);
  const isAdmin = user?.role === "ADMIN";

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>(() => {
    if (isClient) return user?.companyId ?? "";
    return user?.id ? getPersistedCompanyId(user.id) ?? "" : "";
  });
  const [q, setQ] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contracts, setContracts] = useState<CompanyContract[]>([]);
  const [overview, setOverview] = useState<FinancialOverviewResponse | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>("Contrato");
  const [pendingQuestionsCount, setPendingQuestionsCount] = useState(0);
  const [questionsCompany, setQuestionsCompany] =
    useState<RendimentoCompany | null>(null);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const companyRequestIdRef = useRef(0);
  const activeCompanyId = isClient
    ? user?.companyId ?? ""
    : isValidCompanyUuid(companyId)
      ? companyId
      : "";
  const companyOptions = useMemo(
    () => companies.map((c) => ({ value: c.id, label: c.name })),
    [companies],
  );

  async function loadCompanies() {
    if (isClient) return;
    try {
      const list =
        user?.role === "ADMIN"
          ? await companiesService.list()
          : await companiesService.listAccessible();
      const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      setCompanies(sorted);
      const picked = pickCompanyIdFromList(sorted, {
        userId: user?.id,
        preferredIds: [companyId],
      });
      if (picked) {
        setCompanyId(picked);
      }
    } catch {
      // silencioso
    }
  }

  async function loadContracts(opts?: { silent?: boolean }) {
    const silent = opts?.silent === true;
    if (!isClient && !isValidCompanyUuid(companyId)) return;

    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await financialService.listContracts({
        companyId: isClient ? undefined : companyId,
      });
      setContracts(Array.isArray(res.contracts) ? res.contracts : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar contratos");
      setContracts([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function loadOverview(opts?: { silent?: boolean }) {
    const silent = opts?.silent === true;
    if (!isClient && !isValidCompanyUuid(companyId)) return;

    try {
      const res = await financialService.overview({
        companyId: isClient ? undefined : companyId,
      });
      setOverview(res);
    } catch (e) {
      // não bloquear a tela toda se o overview falhar
      if (!silent) {
        setError(e instanceof Error ? e.message : "Erro ao carregar resumo financeiro");
      }
      setOverview(null);
    }
  }

  useEffect(() => {
    void loadCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient]);

  useEffect(() => {
    // troca de empresa: limpa visual imediatamente e garante que só a última resposta aplica
    const requestId = companyRequestIdRef.current + 1;
    companyRequestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    setContracts([]);
    setOverview(null);

    let cancelled = false;
    void (async () => {
      try {
        await Promise.all([
          loadContracts({ silent: true }),
          loadOverview({ silent: true }),
        ]);
      } finally {
        if (!cancelled && requestId === companyRequestIdRef.current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, isClient]);

  const reloadCompanyQuestionsMeta = useCallback(async () => {
    if (!activeCompanyId) {
      setPendingQuestionsCount(0);
      setQuestionsCompany(null);
      return;
    }
    try {
      const list = await rendimentoService.listCompanies();
      const found = ensureArray(list).find((c) => c.id === activeCompanyId);
      setQuestionsCompany(found ?? null);
      setPendingQuestionsCount(found?.pendingQuestionsCount ?? 0);
    } catch {
      setQuestionsCompany(null);
      setPendingQuestionsCount(0);
    }
  }, [activeCompanyId]);

  useEffect(() => {
    void reloadCompanyQuestionsMeta();
  }, [reloadCompanyQuestionsMeta]);

  const handleAgendaLoaded = useCallback(
    (agenda: RendimentoCompanyAgenda | null) => {
      if (agenda != null) {
        setPendingQuestionsCount(agenda.totalPendingQuestions ?? 0);
      }
    },
    [],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const items = contracts ?? [];
    const base = !term
      ? items
      : items.filter((c) => {
      const hay = `${c.id} ${c.title} ${c.description ?? ""}`.toLowerCase();
      return hay.includes(term);
    });
    return [...base].sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  }, [contracts, q]);

  const metrics = useMemo(() => {
    const items = contracts ?? [];
    const actives = items.filter((i) => i.status === "ACTIVE").length;
    const inactives = items.filter((i) => i.status === "INACTIVE").length;
    const expired = items.filter((i) => i.status === "EXPIRED").length;
    return { total: items.length, actives, inactives, expired };
  }, [contracts]);

  const hours = useMemo(() => {
    const t = overview?.totals;
    const contracted = t?.contractedHours ?? 0;
    const used = t?.usedHours ?? 0;
    const extraHours = t?.extraHours ?? Math.max(0, used - contracted);
    const active = (contracts ?? []).filter((c) => c.status === "ACTIVE");
    const listedRate =
      active.length === 1 ? contractListedRate(active[0]) : null;
    let extraHourPrice = moneyNumber(t?.extraHourPrice);
    if (extraHourPrice == null || (extraHourPrice === 0 && listedRate)) {
      extraHourPrice = listedRate;
    }
    const extraAmount =
      extraHourPrice != null
        ? extraHours * extraHourPrice
        : (t?.extraAmount ?? 0);
    return { contracted, used, extraHours, extraAmount, extraHourPrice };
  }, [overview?.totals, contracts]);

  async function handleDownload(contractId: string) {
    try {
      const res = await financialService.downloadContractFile({
        contractId,
        companyId: isClient ? undefined : companyId,
      });
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao baixar arquivo");
    }
  }

  async function handleView(contractId: string) {
    try {
      const res = await financialService.downloadContractFile({
        contractId,
        companyId: isClient ? undefined : companyId,
      });
      const url = URL.createObjectURL(res.blob);
      // revoga o anterior (se houver) para não vazar memória
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setPreviewName(res.filename || "Contrato");
      setPreviewOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao visualizar arquivo");
    }
  }

  return (
    <ProtectedPage>
      <PermissionGate module="FINANCIAL">
      <AppShell>
        <div className="font-sans w-full space-y-8">
          <Dialog
            open={previewOpen}
            onOpenChange={(open) => {
              setPreviewOpen(open);
              if (!open) {
                setPreviewUrl((prev) => {
                  if (prev) URL.revokeObjectURL(prev);
                  return null;
                });
              }
            }}
          >
            <DialogContent className="font-sans max-w-[95vw] sm:max-w-5xl border border-border bg-card text-card-foreground">
              <DialogHeader>
                <DialogTitle className="font-sans">{previewName}</DialogTitle>
                <DialogDescription className="font-sans text-muted-foreground">
                  Pré-visualização do contrato.
                </DialogDescription>
              </DialogHeader>

              <div className="h-[75vh] overflow-hidden rounded-xl border border-border bg-background">
                {previewUrl ? (
                  <iframe
                    title="Contrato"
                    src={previewUrl}
                    className="h-full w-full"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                    Carregando...
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold">Financeiro</h1>
              <p className="text-muted-foreground">
                Resumo contratual (contratos no portal + horas dos apontamentos).
              </p>
            </div>

            <div className="flex flex-nowrap items-center gap-2">
              {!isClient ? (
                <div className="w-[min(100vw-9rem,260px)] shrink-0">
                  <SearchableSelectField
                    value={companyId}
                    onChange={(id) => {
                      setCompanyId(id);
                      if (user?.id) setPersistedCompanyId(user.id, id || null);
                    }}
                    options={companyOptions}
                    emptyLabel="Selecione a empresa..."
                    className="h-9 w-full rounded-lg text-sm"
                  />
                </div>
              ) : null}
              <Button
                type="button"
                disabled={refreshing || loading}
                variant="outline"
                className="h-9 shrink-0 px-3 text-sm"
                onClick={async () => {
                  setRefreshing(true);
                  try {
                    await Promise.all([
                      loadContracts({ silent: true }),
                      loadOverview({ silent: true }),
                      reloadCompanyQuestionsMeta(),
                    ]);
                  } finally {
                    setRefreshing(false);
                  }
                }}
              >
                <RefreshCw
                  className={cn("mr-2 size-4", refreshing && "animate-spin")}
                />
                Atualizar
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-4">
            <Card>
              <CardContent className="flex min-h-[132px] items-center justify-between p-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground">Horas contratadas</p>
                  <p className="text-3xl font-bold">{hours.contracted.toFixed(2)}h</p>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <FileText size={28} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex min-h-[132px] items-center justify-between p-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground">Horas utilizadas</p>
                  <p className="text-3xl font-bold">{hours.used.toFixed(2)}h</p>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-300">
                  <ShieldCheck size={28} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex min-h-[132px] items-center justify-between p-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground">Excedente</p>
                  {hours.extraHours > 0 ? (
                    <>
                      <p className="text-3xl font-bold text-orange-300">
                        {hours.extraHours.toFixed(2)}h
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Valor extra:{" "}
                        <span className="font-bold">
                          {formatBrl(hours.extraAmount)}
                        </span>
                      </p>
                    </>
                  ) : (
                    <p className="text-3xl font-bold text-emerald-300">Dentro do plano</p>
                  )}
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/12 text-orange-300">
                  <TriangleAlert size={28} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex min-h-[132px] items-center justify-between p-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground">Valor hora excedente</p>
                  <p className="text-3xl font-bold">
                    {hours.extraHourPrice == null
                      ? "—"
                      : formatBrl(hours.extraHourPrice)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {hours.extraHourPrice == null
                      ? "Definido por contrato (exibido quando há 1 taxa única nos contratos ativos)."
                      : "Baseado no contrato ativo."}
                  </p>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-500/12 text-zinc-200">
                  <Building2 size={28} />
                </div>
              </CardContent>
            </Card>
          </div>

          {error ? (
            <div className="alle-alert-error rounded-xl p-4 text-sm">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Contratos</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Buscar por título/descrição"
                      className="h-11 pl-10"
                    />
                  </div>

                  {isClient ? (
                    <Input
                      value={user?.companyName ?? "Minha empresa"}
                      disabled
                      className="h-11"
                    />
                  ) : null}
                </div>

                <div className="text-xs text-muted-foreground">
                  {metrics.total} total • {metrics.actives} ativo(s) • {metrics.inactives} inativo(s) • {metrics.expired} expirado(s)
                </div>

                {loading ? (
                  <div className="rounded-xl border border-border bg-background p-6 text-sm text-muted-foreground">
                    Carregando contratos...
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="rounded-xl border border-border bg-background p-6 text-sm text-muted-foreground">
                    Nenhum contrato encontrado.
                  </div>
                ) : (
                  <Accordion type="multiple" className="w-full space-y-3">
                    {filtered.map((c) => (
                      <AccordionItem
                        key={c.id}
                        value={String(c.id)}
                        className="rounded-xl border border-border bg-background px-4"
                      >
                        <AccordionTrigger className="text-left hover:no-underline">
                          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold">{c.title}</div>
                              <div className="text-xs text-muted-foreground">
                                {contractListedHours(c)}h/mês • excedente:{" "}
                                {(() => {
                                  const rate = contractListedRate(c);
                                  return rate == null ? "variável" : formatBrl(rate);
                                })()}
                              </div>
                              {c.classification?.name ? (
                                <div className="mt-0.5 truncate text-xs text-muted-foreground/80">
                                  {c.classification.name}
                                </div>
                              ) : null}
                            </div>
                            <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                              {contractStatusLabel(c.status)}
                            </span>
                          </div>
                        </AccordionTrigger>

                        <AccordionContent>
                          <div className="grid grid-cols-1 gap-3 pt-2 md:grid-cols-2">
                            <div className="rounded-xl border border-border bg-card p-4">
                              <div className="text-xs text-muted-foreground">Vigência</div>
                              <div className="mt-1 text-sm">
                                {new Date(c.startDate).toLocaleDateString("pt-BR")}{" "}
                                {c.endDate
                                  ? `→ ${new Date(c.endDate).toLocaleDateString("pt-BR")}`
                                  : "→ (sem fim)"}
                              </div>
                            </div>
                            <div className="rounded-xl border border-border bg-card p-4">
                              <div className="text-xs text-muted-foreground">Descrição</div>
                              <div className="mt-1 text-sm">
                                {c.description || "—"}
                              </div>
                            </div>
                          </div>

                          {(c.specialties ?? []).length > 0 ? (
                            <div className="mt-3 space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Especialidades
                              </p>
                              <ul className="space-y-2">
                                {(c.specialties ?? []).map((line) => (
                                  <li
                                    key={line.id}
                                    className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground"
                                  >
                                    {formatSpecialtyLineSummary(line)}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {((c.contractFiles ?? []).find((f) => f.type === "CONTRACT")) ? (
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                              <Button
                                type="button"
                                variant="outline"
                                className="h-10"
                                onClick={() => void handleView(c.id)}
                              >
                                Visualizar
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-10"
                                onClick={() => void handleDownload(c.id)}
                              >
                                Baixar
                              </Button>
                            </div>
                          ) : (
                            <div className="mt-3 text-xs text-muted-foreground">
                              Sem arquivo anexado neste contrato.
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Resumo contratual</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="rounded-xl border border-border bg-background p-4">
                  <p className="text-sm text-muted-foreground">Empresa</p>
                  <p className="mt-1 font-semibold">
                    {overview?.company?.name ??
                      (isClient ? user?.companyName ?? "Minha empresa" : "—")}
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Questionamentos
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Apontamentos questionados pelo cliente aguardando resposta.
                      </p>
                    </div>
                    {isAdmin ? (
                      <PendingQuestionsBadge
                        count={pendingQuestionsCount}
                        onClick={
                          pendingQuestionsCount > 0 && questionsCompany
                            ? () => setQuestionsOpen(true)
                            : undefined
                        }
                      />
                    ) : (
                      <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                        {pendingQuestionsCount > 0
                          ? `${pendingQuestionsCount} pendente(s)`
                          : "Nenhum pendente"}
                      </span>
                    )}
                  </div>
                  {pendingQuestionsCount > 0 ? (
                    <p className="alle-alert-banner mt-3 rounded-lg px-3 py-2 text-xs">
                      Há questionamentos pendentes nesta empresa. Responda pelo
                      painel abaixo ou use o botão acima.
                    </p>
                  ) : null}
                </div>

                {(overview?.contracts ?? []).length === 0 ? (
                  <div className="rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground">
                    Nenhum contrato cadastrado no portal para esta empresa.
                  </div>
                ) : (
                  (overview?.contracts ?? []).map((c) => (
                    <div
                      key={c.id}
                      className="rounded-xl border border-border bg-background p-4"
                    >
                      <p className="text-sm text-muted-foreground">Contrato</p>
                      <p className="mt-1 font-semibold">{c.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {contractStatusLabel(c.status)}
                        {c.monthlyHours > 0 ? ` · ${c.monthlyHours}h/mês contratadas` : ""}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-lg border border-border bg-card p-3">
                          <div className="text-xs text-muted-foreground">Horas/mês</div>
                          <div className="mt-1 font-semibold">
                            {c.monthlyHours}h
                          </div>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-3">
                          <div className="text-xs text-muted-foreground">Hora excedente</div>
                          <div className="mt-1 font-semibold">
                            {c.extraHourPrice > 0
                              ? formatBrl(Number(c.extraHourPrice))
                              : "Variável"}
                          </div>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-3">
                          <div className="text-xs text-muted-foreground">Usadas (mês)</div>
                          <div className="mt-1 font-semibold">
                            {(c.latestBilling?.usedHours ?? 0).toFixed(2)}h
                          </div>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-3">
                          <div className="text-xs text-muted-foreground">Excedente (mês)</div>
                          <div className="mt-1 font-semibold">
                            {(c.latestBilling?.extraHours ?? 0).toFixed(2)}h
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-muted-foreground">
                        Documentos vinculados:{" "}
                        <span className="text-foreground">{c.documentsCount}</span>
                        {c.latestBilling?.monthReference ? (
                          <>
                            {" "}
                            • Referência:{" "}
                            <span className="text-foreground">
                              {new Date(c.latestBilling.monthReference).toLocaleDateString(
                                "pt-BR",
                                { month: "2-digit", year: "numeric" }
                              )}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}

                <div className="rounded-xl border border-border bg-background p-4 text-sm">
                  <div className="text-sm font-semibold">Observações</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    - Administradores e colaboradores escolhem a empresa; clientes veem apenas a própria.
                    <br />- Horas usadas vêm dos apontamentos do portal no mês corrente.
                    <br />- O valor da hora excedente pode ficar em branco quando há taxas diferentes por especialidade.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {activeCompanyId ? (
            <Card id="agenda-empresa">
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  {isClient
                    ? FINANCEIRO_CLIENT_AGENDA_TITLE
                    : "Apontamentos da empresa"}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {isClient
                    ? FINANCEIRO_CLIENT_AGENDA_SUBTITLE
                    : FINANCEIRO_ADMIN_AGENDA_SUBTITLE}
                </p>
              </CardHeader>
              <CardContent>
                <CompanyAgendaPanel
                  companyId={activeCompanyId}
                  isClientUser={isClient}
                  isAdmin={isAdmin}
                  onAgendaLoaded={handleAgendaLoaded}
                />
              </CardContent>
            </Card>
          ) : null}

          <CompanyPendingQuestionsDialog
            company={questionsCompany}
            open={questionsOpen}
            onOpenChange={setQuestionsOpen}
            onAnswered={() => void reloadCompanyQuestionsMeta()}
          />
        </div>
      </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}