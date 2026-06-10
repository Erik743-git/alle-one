"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/layout/app-shell";
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
  RefreshCcw,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { getStoredUser } from "@/lib/session";
import { companiesService, type Company } from "@/lib/services/companies.service";
import {
  companyContractsService,
  type CompanyContract,
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
  pickCompanyIdFromList,
  setPersistedCompanyId,
} from "@/lib/selected-company";
import { ensureArray } from "@/lib/utils";

export default function FinanceiroPage() {
  const user = getStoredUser();
  const isClient = user?.role === "CLIENT";
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
  const activeCompanyId = isClient ? user?.companyId ?? "" : companyId;
  const companyOptions = useMemo(
    () => companies.map((c) => ({ value: c.id, label: c.name })),
    [companies],
  );

  async function loadCompanies() {
    if (isClient) return;
    try {
      const list = await companiesService.list();
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
    if (!isClient && !companyId) return;

    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = isAdmin
        ? await companyContractsService.list(companyId)
        : await financialService.listContracts({
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
    if (!isClient && !companyId) return;

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
    const extraAmount = t?.extraAmount ?? 0;
    return { contracted, used, extraHours, extraAmount };
  }, [overview?.totals]);

  const extraHourPrice = useMemo(() => {
    // Se houver 1 contrato ativo, usa o preço dele; senão, mostra "—"
    const active = (overview?.contracts ?? []).filter((c) => c.status === "ACTIVE");
    if (active.length === 1) return active[0].extraHourPrice;
    return null;
  }, [overview?.contracts]);

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
                Resumo contratual (contratos manuais no portal + horas usadas do TiFlux).
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 pr-4 sm:mr-10 sm:w-auto sm:flex-row sm:items-center lg:mr-14 xl:mr-16">
              {!isClient ? (
                <SearchableSelectField
                  value={companyId}
                  onChange={(id) => {
                    setCompanyId(id);
                    if (user?.id) setPersistedCompanyId(user.id, id || null);
                  }}
                  options={companyOptions}
                  emptyLabel="Selecione a empresa..."
                  className="min-w-[220px]"
                />
              ) : null}
              <Button
                type="button"
                disabled={refreshing}
                variant="outline"
                className="h-11"
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
                <RefreshCcw className="mr-2 h-4 w-4" />
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
                          R$ {hours.extraAmount.toFixed(2)}
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
                    {extraHourPrice === null ? "—" : `R$ ${extraHourPrice.toFixed(2)}`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {extraHourPrice === null
                      ? "Definido por contrato (exibido quando há 1 contrato ativo)."
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
                                {c.monthlyHours}h/mês • excedente: R$ {Number(c.extraHourPrice).toFixed(2)}
                              </div>
                            </div>
                            <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                              {c.status}
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
                            R$ {Number(c.extraHourPrice ?? 0).toFixed(2)}
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
                    - ADMIN/COLLABORATOR escolhem a empresa. CLIENT vê apenas a própria empresa.
                    <br />- Valores do TiFlux podem aparecer como “--” conforme permissões do TiFlux.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {activeCompanyId ? (
            <Card id="agenda-empresa">
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  Apontamentos da empresa
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Agenda por dia, semana ou mês — mesma visão que o cliente vê no
                  portal.
                  {isClient
                    ? " Você pode questionar apontamentos diretamente no calendário."
                    : " Responda questionamentos e abone apontamentos quando necessário."}
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