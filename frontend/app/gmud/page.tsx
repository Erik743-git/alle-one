"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/app-shell";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { sortByName } from "@/lib/collections";
import { getStoredUser } from "@/lib/session";
import { companiesService, type Company } from "@/lib/services/companies.service";
import { gmudsService, type Gmud } from "@/lib/services/gmuds.service";
import { GmudStatusBadge } from "./_components/gmud-status-badge";
import {
  Building2,
  ClipboardList,
  RefreshCcw,
  Search,
  ShieldCheck,
  Play,
} from "lucide-react";

type CompanyGroup = {
  company: Company;
  gmuds: Gmud[];
};

type StatusFilter =
  | "ALL"
  | "OPEN"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "IN_EXECUTION"
  | "EXECUTED"
  | "REJECTED"
  | "CANCELED"
  | "DRAFT";

function companyFromGmudRef(ref: { id: string; name: string }): Company {
  return {
    id: ref.id,
    name: ref.name,
    responsibleName: "",
    email: "",
    status: true,
    logoFileId: null,
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
  };
}

function canEdit(gmud: Gmud) {
  return gmud.status === "DRAFT" || gmud.status === "PENDING_APPROVAL";
}

function canExecute(gmud: Gmud) {
  return gmud.status === "APPROVED" || gmud.status === "IN_EXECUTION";
}

function canApprove(gmud: Gmud, userId?: string | null) {
  if (!userId) return false;
  if (gmud.status !== "PENDING_APPROVAL") return false;
  const me = gmud.approvers?.find((a) => a.user.id === userId);
  return me?.status === "PENDING";
}

function matchesStatusFilter(gmud: Gmud, filter: StatusFilter) {
  if (filter === "ALL") return true;
  if (filter === "OPEN") return gmud.status !== "EXECUTED" && gmud.status !== "CANCELED";
  return gmud.status === filter;
}

function getApprovalSummary(gmud: Gmud) {
  const approvers = gmud.approvers ?? [];
  const approved = approvers.filter((a) => a.status === "APPROVED").length;
  const rejected = approvers.filter((a) => a.status === "REJECTED").length;
  const pending = approvers.filter((a) => a.status === "PENDING").length;
  const pendingNames = approvers
    .filter((a) => a.status === "PENDING")
    .map((a) => a.user.name)
    .slice(0, 3);
  const pendingLabel = pendingNames.length
    ? `Faltam: ${pendingNames.join(", ")}${pending > pendingNames.length ? "…" : ""}`
    : pending > 0
      ? "Faltam aprovações"
      : "Aprovação finalizada";
  return { approved, rejected, pending, pendingLabel };
}

export default function GmudPage() {
  const user = getStoredUser();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [gmuds, setGmuds] = useState<Gmud[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("OPEN");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("ALL");
  const [refreshing, setRefreshing] = useState(false);

  async function loadData(opts?: { silent?: boolean }) {
    const silent = opts?.silent === true;
    let cancelled = false;

    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const isClient = user?.role === "CLIENT";
      const seesGmudsByParticipation =
        user?.role === "COLLABORATOR" || user?.role === "PJ";
      const [companiesData, gmudsData] = await Promise.all([
        isClient || seesGmudsByParticipation
          ? Promise.resolve([] as Company[])
          : companiesService.list(),
        gmudsService.list(),
      ]);

      if (cancelled) return;
      setCompanies(sortByName(companiesData));
      setGmuds(gmudsData);
    } catch (e) {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : "Erro ao carregar GMUDs");
    } finally {
      if (!cancelled && !silent) setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }

  useEffect(() => {
    let cleanup: void | (() => void);
    loadData().then((c) => (cleanup = c));
    return () => {
      if (cleanup) cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  const scopedCompanies = useMemo<CompanyGroup[]>(() => {
    const isClient = user?.role === "CLIENT";
    const seesGmudsByParticipation =
      user?.role === "COLLABORATOR" || user?.role === "PJ";

    if (seesGmudsByParticipation) {
      const companyMap = new Map<string, Company>();
      for (const g of gmuds) {
        if (g.company && !companyMap.has(g.company.id)) {
          companyMap.set(g.company.id, companyFromGmudRef(g.company));
        }
      }
      return sortByName([...companyMap.values()]).map((c) => ({
        company: c,
        gmuds: gmuds.filter((g) => g.companyId === c.id),
      }));
    }

    if (isClient) {
      const companyId = user?.companyId;
      const companyName = user?.companyName ?? "Minha empresa";
      const company: Company = {
        id: companyId ?? "client-company",
        name: companyName,
        responsibleName: "",
        email: "",
        status: true,
        logoFileId: null,
        createdAt: "",
        updatedAt: "",
        deletedAt: null,
      };

      return [
        {
          company,
          gmuds: gmuds.filter((g) => !companyId || g.companyId === companyId),
        },
      ];
    }

    const byCompany = new Map<string, Gmud[]>();
    for (const g of gmuds) {
      byCompany.set(g.companyId, [...(byCompany.get(g.companyId) ?? []), g]);
    }

    return sortByName(companies).map((c) => ({
      company: c,
      gmuds: byCompany.get(c.id) ?? [],
    }));
  }, [companies, gmuds, user?.role, user?.companyId, user?.companyName]);

  const filteredGroups = useMemo<CompanyGroup[]>(() => {
    const term = search.trim().toLowerCase();

    const companyPass = (companyId: string) => {
      const filter = selectedCompanyId.trim();
      return !filter || filter === "ALL" || filter === companyId;
    };

    return scopedCompanies
      .filter((g) => companyPass(g.company.id))
      .map((g) => {
        const filtered = g.gmuds
          .filter((gmud) => matchesStatusFilter(gmud, statusFilter))
          .filter((gmud) => {
            if (!term) return true;
            const hay = `${gmud.code} ${gmud.title} ${gmud.creator?.name ?? ""}`.toLowerCase();
            return hay.includes(term);
          })
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

        return { company: g.company, gmuds: filtered };
      })
      .filter((g) => g.gmuds.length > 0);
  }, [scopedCompanies, search, selectedCompanyId, statusFilter]);

  const totals = useMemo(() => {
    const total = gmuds.length;
    const pending = gmuds.filter((g) => g.status === "PENDING_APPROVAL").length;
    const open = gmuds.filter((g) => g.status !== "EXECUTED" && g.status !== "CANCELED").length;
    const executing = gmuds.filter((g) => g.status === "IN_EXECUTION").length;
    return { total, pending, open, executing };
  }, [gmuds]);

  return (
    <ProtectedPage>
      <PermissionGate module="GMUD">
      <AppShell>
        <div className="font-sans w-full space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-foreground">GMUD</h1>
              <p className="text-muted-foreground">Gerenciamento de mudanças do ambiente.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={refreshing}
                variant="outline"
                className="h-11"
                onClick={async () => {
                  setRefreshing(true);
                  try {
                    await loadData({ silent: true });
                  } finally {
                    setRefreshing(false);
                  }
                }}
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
              <Link href="/gmud/new">
                <Button className="h-11">
                  Nova GMUD
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-4">
            <Card>
              <CardContent className="flex min-h-[132px] items-center justify-between p-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground">Total</p>
                  <p className="text-3xl font-bold">{totals.total}</p>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <ClipboardList size={28} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex min-h-[132px] items-center justify-between p-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground">Abertas</p>
                  <p className="text-3xl font-bold">{totals.open}</p>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-300">
                  <Building2 size={28} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex min-h-[132px] items-center justify-between p-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground">Aguardando aprovação</p>
                  <p className="text-3xl font-bold">{totals.pending}</p>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/12 text-orange-300">
                  <ShieldCheck size={28} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex min-h-[132px] items-center justify-between p-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground">Em execução</p>
                  <p className="text-3xl font-bold">{totals.executing}</p>
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/12 text-blue-200">
                  <Play size={28} />
                </div>
              </CardContent>
            </Card>
          </div>

          {error ? (
            <div className="alle-alert-error rounded-xl p-4 text-sm">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Carregando GMUDs...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[1.2fr_0.8fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-muted-foreground">Lista de GMUDs</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar por #código, título ou criador"
                        className="h-11 pl-10"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <SearchableSelectField
                        value={statusFilter}
                        onChange={(value) => setStatusFilter(value as StatusFilter)}
                        options={[
                          { value: "OPEN", label: "Abertas" },
                          { value: "ALL", label: "Todas" },
                          { value: "PENDING_APPROVAL", label: "Pendente aprovação" },
                          { value: "APPROVED", label: "Aprovadas" },
                          { value: "IN_EXECUTION", label: "Em execução" },
                          { value: "EXECUTED", label: "Executadas" },
                          { value: "REJECTED", label: "Rejeitadas" },
                          { value: "CANCELED", label: "Canceladas" },
                          { value: "DRAFT", label: "Rascunho" },
                        ]}
                      />

                      <SearchableSelectField
                        value={selectedCompanyId === "ALL" ? "" : selectedCompanyId}
                        onChange={(value) => setSelectedCompanyId(value || "ALL")}
                        disabled={user?.role === "CLIENT"}
                        options={scopedCompanies.map((g) => ({
                          value: g.company.id,
                          label: g.company.name,
                        }))}
                        emptyLabel="Todas empresas"
                      />
                    </div>
                  </div>

                  {filteredGroups.length === 0 ? (
                    <div className="rounded-xl border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
                      Nenhuma GMUD encontrada com os filtros atuais.
                      <div className="mt-4">
                        <Link href="/gmud/new">
                          <Button>
                            Criar primeira GMUD
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="max-h-[62vh] overflow-y-auto pr-2">
                      <Accordion type="multiple" className="w-full space-y-3">
                        {filteredGroups.map((group) => (
                          <AccordionItem
                            key={group.company.id}
                            value={group.company.id}
                            className="rounded-xl border border-border bg-muted/40 px-4"
                          >
                            <AccordionTrigger className="text-left text-foreground hover:no-underline">
                              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold">
                                    {group.company.name}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {group.gmuds.length} GMUD
                                    {group.gmuds.length === 1 ? "" : "s"} neste filtro
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs text-foreground">
                                    {group.gmuds.filter((g) => g.status === "PENDING_APPROVAL").length} pendentes
                                  </span>
                                  <span className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs text-foreground">
                                    {group.gmuds.filter((g) => g.status === "IN_EXECUTION").length} execução
                                  </span>
                                </div>
                              </div>
                            </AccordionTrigger>

                            <AccordionContent>
                              <div className="space-y-3 pt-2">
                                {group.gmuds.map((gmud) => (
                                  <div
                                    key={gmud.id}
                                    className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                                  >
                                    <div className="min-w-0 space-y-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <div className="text-sm font-bold text-foreground">
                                          #{gmud.code} — {gmud.title}
                                        </div>
                                        <GmudStatusBadge status={gmud.status} />
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        Criada por {gmud.creator?.name ?? "—"} •{" "}
                                        {new Date(gmud.createdAt).toLocaleString("pt-BR")}
                                      </div>
                                      {gmud.status === "PENDING_APPROVAL" ? (
                                        <div className="mt-1 text-xs text-muted-foreground">
                                          {(() => {
                                            const s = getApprovalSummary(gmud);
                                            return (
                                              <span>
                                                Aprovações:{" "}
                                                <span className="text-foreground">
                                                  {s.approved} aprov.
                                                </span>
                                                {" • "}
                                                <span className="text-foreground">
                                                  {s.pending} pend.
                                                </span>
                                                {s.rejected ? (
                                                  <>
                                                    {" • "}
                                                    <span className="text-destructive font-medium">
                                                      {s.rejected} rejeit.
                                                    </span>
                                                  </>
                                                ) : null}
                                                {" — "}
                                                <span className="text-foreground/80">
                                                  {s.pendingLabel}
                                                </span>
                                              </span>
                                            );
                                          })()}
                                        </div>
                                      ) : null}
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                      <Link href={`/gmud/${gmud.id}`}>
                                        <Button
                                          variant="outline"
                                          className=""
                                        >
                                          Ver
                                        </Button>
                                      </Link>
                                      {canEdit(gmud) ? (
                                        <Link href={`/gmud/${gmud.id}?mode=edit`}>
                                          <Button>
                                            Editar
                                          </Button>
                                        </Link>
                                      ) : null}
                                      {canApprove(gmud, user?.id ?? null) ? (
                                        <Link href={`/gmud/${gmud.id}`}>
                                          <Button className="bg-orange-600 text-white hover:bg-orange-700 dark:bg-orange-600 dark:text-white">
                                            Aprovar
                                          </Button>
                                        </Link>
                                      ) : null}
                                      {canExecute(gmud) ? (
                                        <Link href={`/gmud/${gmud.id}`}>
                                          <Button className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:text-white">
                                            {gmud.status === "APPROVED" ? "Executar" : "Execução"}
                                          </Button>
                                        </Link>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-muted-foreground">Dicas rápidas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <div className="rounded-xl border border-border bg-muted/40 p-4">
                    <div className="font-semibold text-foreground">Fluxo</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Criação → Aprovação (todos aprovam) → Execução.
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/40 p-4">
                    <div className="font-semibold text-foreground">Busca</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Use <span className="text-foreground">#1234</span> ou palavras do título.
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/40 p-4">
                    <div className="font-semibold text-foreground">Aprovação</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      O botão “Aprovar” só aparece para aprovadores pendentes.
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}