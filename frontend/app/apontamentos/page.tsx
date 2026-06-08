"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  CalendarDays,
  Loader2,
  Search,
  Users,
} from "lucide-react";

import AppShell from "@/components/layout/app-shell";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getStoredUser } from "@/lib/session";
import {
  isCollaboratorRole,
  isPjRole,
  roleDisplayLabel,
} from "@/lib/app-roles";
import { isClient } from "@/lib/access-control";
import { notifyError } from "@/lib/notify";
import { ensureArray } from "@/lib/utils";
import {
  CompanyPendingQuestionsDialog,
  PendingQuestionsBadge,
} from "@/components/rendimento/company-pending-questions-dialog";
import {
  rendimentoService,
  type RendimentoCollaborator,
  type RendimentoCompany,
} from "@/lib/services/rendimento.service";

type AdminViewMode = "people" | "company";

function RendimentoPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authUser = getStoredUser();
  const isAdmin = authUser?.role === "ADMIN";
  const isClientUser = isClient();

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [collaborators, setCollaborators] = useState<RendimentoCollaborator[]>(
    [],
  );
  const [companies, setCompanies] = useState<RendimentoCompany[]>([]);
  const [viewMode, setViewMode] = useState<AdminViewMode>("people");
  const [questionsCompany, setQuestionsCompany] =
    useState<RendimentoCompany | null>(null);
  const [questionsOpen, setQuestionsOpen] = useState(false);

  const reloadCompanies = useCallback(async () => {
    const data = await rendimentoService.listCompanies();
    setCompanies(ensureArray(data));
  }, []);

  useEffect(() => {
    const mode = searchParams.get("view");
    if (mode === "company" || mode === "people") {
      setViewMode(mode);
    }
  }, [searchParams]);

  useEffect(() => {
    void (async () => {
      try {
        if (isPjRole(authUser?.role)) {
          router.replace("/dashboard");
          return;
        }
        if (
          authUser &&
          isCollaboratorRole(authUser.role) &&
          authUser.id
        ) {
          router.replace(`/apontamentos/${authUser.id}`);
          return;
        }
        if (isClientUser && authUser?.companyId) {
          router.replace(`/apontamentos/empresa/${authUser.companyId}`);
          return;
        }
        setLoading(true);
        if (isAdmin && viewMode === "company") {
          await reloadCompanies();
        } else if (isAdmin) {
          const data = await rendimentoService.listCollaborators();
          setCollaborators(ensureArray(data));
        }
      } catch (err) {
        notifyError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar os dados.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [authUser?.id, authUser?.role, authUser?.companyId, isAdmin, isClientUser, reloadCompanies, router, viewMode]);

  const openCompanyQuestions = (company: RendimentoCompany) => {
    setQuestionsCompany(company);
    setQuestionsOpen(true);
  };

  const setMode = (mode: AdminViewMode) => {
    setViewMode(mode);
    router.replace(mode === "company" ? "/apontamentos?view=company" : "/apontamentos");
  };

  const filteredCollaborators = useMemo(() => {
    const list = ensureArray(collaborators);
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter((item) => {
      const haystack = [
        item.name,
        item.email,
        item.companyName ?? "",
        item.tifluxUserName ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [collaborators, search]);

  const filteredCompanies = useMemo(() => {
    const list = ensureArray(companies);
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter((item) => {
      const haystack = [item.name, item.tifluxClientName ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [companies, search]);

  const showPeople = isAdmin && viewMode === "people";
  const showCompany = isAdmin && viewMode === "company";

  return (
    <ProtectedPage>
      <PermissionGate module="RENDIMENTO">
        <AppShell>
          <div className="font-sans w-full space-y-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  {showCompany ? <Building2 size={24} /> : <Users size={24} />}
                </div>
                <h1 className="text-3xl font-bold text-foreground">
                  Apontamentos
                </h1>
                <p className="max-w-2xl text-muted-foreground">
                  {showCompany
                    ? "Visão empresarial — o que o cliente vê. Acompanhe apontamentos por empresa e responda questionamentos."
                    : "Acompanhe os apontamentos de horas dos colaboradores no TiFlux. A coluna «Horas no mês» usa total sem sobreposição no mesmo dia; na agenda, cada apontamento continua listado normalmente."}
                </p>
              </div>

              {isAdmin && (
                <div className="flex rounded-xl border border-border p-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={viewMode === "people" ? "default" : "ghost"}
                    onClick={() => setMode("people")}
                    title="Visão colaboradores"
                  >
                    <Users className="mr-2 size-4" />
                    Colaboradores
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={viewMode === "company" ? "default" : "ghost"}
                    onClick={() => setMode("company")}
                    title="Visão empresarial"
                  >
                    <Building2 className="mr-2 size-4" />
                    Empresas
                  </Button>
                </div>
              )}
            </div>

            <Card>
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-lg">
                  {showCompany ? "Empresas" : "Colaboradores"}
                </CardTitle>
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={
                      showCompany ? "Buscar empresa..." : "Buscar nome ou e-mail..."
                    }
                    className="h-10 pl-9"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex min-h-[200px] items-center justify-center">
                    <Loader2 className="size-8 animate-spin text-primary" />
                  </div>
                ) : showCompany ? (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full min-w-[880px] text-left font-sans text-sm">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Empresa</th>
                          <th className="px-4 py-3 font-semibold">Cliente TiFlux</th>
                          <th className="px-4 py-3 font-semibold">Horas no mês</th>
                          <th className="px-4 py-3 font-semibold">Questionamentos</th>
                          <th className="px-4 py-3 font-semibold text-right">
                            Agenda
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCompanies.length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-4 py-8 text-center text-muted-foreground"
                            >
                              Nenhuma empresa com vínculo TiFlux encontrada.
                            </td>
                          </tr>
                        ) : (
                          filteredCompanies.map((item) => (
                            <tr
                              key={item.id}
                              className="border-t border-border hover:bg-muted/20"
                            >
                              <td className="px-4 py-3 font-medium text-foreground">
                                {item.name}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {item.tifluxClientName ??
                                  (item.tifluxClientId
                                    ? `ID ${item.tifluxClientId}`
                                    : "Sem vínculo")}
                              </td>
                              <td className="px-4 py-3 font-bold text-primary">
                                {item.monthTotalHoursFormatted ?? "00:00"}
                              </td>
                              <td className="px-4 py-3">
                                <PendingQuestionsBadge
                                  count={item.pendingQuestionsCount ?? 0}
                                  onClick={
                                    item.pendingQuestionsCount > 0
                                      ? () => openCompanyQuestions(item)
                                      : undefined
                                  }
                                />
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Button asChild size="sm" variant="outline">
                                  <Link href={`/apontamentos/empresa/${item.id}`}>
                                    <CalendarDays className="mr-2 size-4" />
                                    Ver agenda
                                  </Link>
                                </Button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full min-w-[720px] text-left font-sans text-sm">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Nome</th>
                          <th className="px-4 py-3 font-semibold">E-mail</th>
                          <th className="px-4 py-3 font-semibold">Perfil</th>
                          <th className="px-4 py-3 font-semibold">Horas no mês</th>
                          <th className="px-4 py-3 font-semibold">TiFlux</th>
                          <th className="px-4 py-3 font-semibold text-right">
                            Agenda
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCollaborators.length === 0 ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-4 py-8 text-center text-muted-foreground"
                            >
                              Nenhum colaborador encontrado.
                            </td>
                          </tr>
                        ) : (
                          filteredCollaborators.map((item) => (
                            <tr
                              key={item.id}
                              className="border-t border-border hover:bg-muted/20"
                            >
                              <td className="px-4 py-3 font-medium text-foreground">
                                {item.name}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {item.email}
                              </td>
                              <td className="px-4 py-3">
                                {roleDisplayLabel(item.role)}
                              </td>
                              <td className="px-4 py-3 font-bold text-primary">
                                {item.monthTotalHoursFormatted}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {item.tifluxUserId
                                  ? item.tifluxUserName ?? `ID ${item.tifluxUserId}`
                                  : "Sem vínculo"}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Button asChild size="sm" variant="outline">
                                  <Link href={`/apontamentos/${item.id}`}>
                                    <CalendarDays className="mr-2 size-4" />
                                    Ver agenda
                                  </Link>
                                </Button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <CompanyPendingQuestionsDialog
            company={questionsCompany}
            open={questionsOpen}
            onOpenChange={setQuestionsOpen}
            onAnswered={() => void reloadCompanies()}
          />
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}

export default function RendimentoPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      }
    >
      <RendimentoPageContent />
    </Suspense>
  );
}
