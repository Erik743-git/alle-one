"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  ChevronRight,
  Layers,
  Loader2,
  Package,
  RefreshCw,
  Search,
} from "lucide-react";

import AppShell from "@/components/layout/app-shell";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { isClient } from "@/lib/access-control";
import { notifyError } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  inventarioService,
  type InventoryAssetTypeOverview,
  type InventoryCompany,
} from "@/lib/services/inventario.service";

type InventarioView = "companies" | "types";

function formatCountLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatExpiredSuffix(expiredCount: number) {
  if (expiredCount <= 0) return null;
  return expiredCount === 1
    ? "(vencido)"
    : `(${expiredCount} vencidos)`;
}

export default function InventarioPage() {
  const router = useRouter();
  const clientUser = isClient();
  const [view, setView] = useState<InventarioView>("companies");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [companies, setCompanies] = useState<InventoryCompany[]>([]);
  const [assetTypes, setAssetTypes] = useState<InventoryAssetTypeOverview[]>([]);
  const [search, setSearch] = useState("");

  const load = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);

      if (clientUser) {
        const data = await inventarioService.listCompanies();
        setCompanies(data);
        if (data.length === 1) {
          router.replace(`/inventario/${data[0].id}`);
        }
        return;
      }

      const [companiesData, typesData] = await Promise.all([
        inventarioService.listCompanies(),
        inventarioService.listAssetTypesOverview(),
      ]);
      setCompanies(companiesData);
      setAssetTypes(typesData);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível carregar o inventário.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clientUser, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, search]);

  const filteredTypes = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? assetTypes.filter((t) => t.name.toLowerCase().includes(q))
      : assetTypes;
    return [...base].sort((a, b) => {
      if (b.assetsCount !== a.assetsCount) return b.assetsCount - a.assetsCount;
      return a.name.localeCompare(b.name, "pt-BR");
    });
  }, [assetTypes, search]);

  const redirectingClient =
    clientUser && (loading || (companies.length === 1 && !search.trim()));

  const searchPlaceholder =
    view === "companies" ? "Buscar empresa…" : "Buscar tipo de ativo…";

  const emptyMessage =
    view === "companies"
      ? "Nenhuma empresa encontrada."
      : "Nenhum tipo de ativo encontrado.";

  return (
    <ProtectedPage>
      <PermissionGate module="INVENTARIO">
        <AppShell>
          <div className="font-sans w-full space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                  <Package className="h-7 w-7 text-primary" />
                  Inventário
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {clientUser
                    ? "Visualize os ativos da sua empresa."
                    : view === "companies"
                      ? "Selecione uma empresa para ver e gerenciar os ativos."
                      : "Selecione um tipo de ativo para ver todos os cadastros nas empresas."}
                </p>
              </div>
              {!clientUser ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void load(true)}
                  disabled={refreshing || loading}
                >
                  <RefreshCw
                    className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")}
                  />
                  Atualizar
                </Button>
              ) : null}
            </div>

            {!clientUser ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex rounded-lg border p-1 bg-muted/40">
                  <Button
                    type="button"
                    size="sm"
                    variant={view === "companies" ? "default" : "ghost"}
                    className="h-8"
                    onClick={() => setView("companies")}
                  >
                    <Building2 className="h-4 w-4 mr-1.5" />
                    Por empresa
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={view === "types" ? "default" : "ghost"}
                    className="h-8"
                    onClick={() => setView("types")}
                  >
                    <Layers className="h-4 w-4 mr-1.5" />
                    Por tipo de ativo
                  </Button>
                </div>

                <div className="relative w-full sm:max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder={searchPlaceholder}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {loading || redirectingClient ? (
              <div className="flex min-h-[30vh] items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                Carregando inventário…
              </div>
            ) : view === "companies" ? (
              filteredCompanies.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    {emptyMessage}
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredCompanies.map((company) => {
                    const countLabel = formatCountLabel(
                      company.assetsCount,
                      "ativo",
                      "ativos",
                    );
                    const expiredSuffix = formatExpiredSuffix(company.expiredCount);
                    return (
                      <Link key={company.id} href={`/inventario/${company.id}`}>
                        <Card className="h-full overflow-hidden transition-colors hover:border-primary/40 hover:bg-muted/30">
                          <CardHeader className="pb-2">
                            <CardTitle className="flex min-w-0 items-center gap-2 text-base">
                              <Building2 className="h-4 w-4 shrink-0 text-primary" />
                              <span
                                className="min-w-0 truncate"
                                title={company.name}
                              >
                                {company.name}
                              </span>
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                            <span>
                              {countLabel}
                              {expiredSuffix ? (
                                <span className="text-destructive font-medium">
                                  {" "}
                                  {expiredSuffix}
                                </span>
                              ) : null}
                            </span>
                            <ChevronRight className="h-4 w-4" />
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              )
            ) : filteredTypes.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredTypes.map((type) => {
                  const countLabel = formatCountLabel(
                    type.assetsCount,
                    "ativo",
                    "ativos",
                  );
                  const expiredSuffix = formatExpiredSuffix(type.expiredCount);
                  const companiesLabel = formatCountLabel(
                    type.companiesCount,
                    "empresa",
                    "empresas",
                  );
                  return (
                    <Link key={type.id} href={`/inventario/tipo/${type.id}`}>
                      <Card className="h-full overflow-hidden transition-colors hover:border-primary/40 hover:bg-muted/30">
                        <CardHeader className="pb-2">
                          <CardTitle className="flex min-w-0 items-center gap-2 text-base">
                            <Layers className="h-4 w-4 shrink-0 text-primary" />
                            <span className="min-w-0 truncate" title={type.name}>
                              {type.name}
                            </span>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                          <div className="min-w-0">
                            <p>
                              {countLabel}
                              {expiredSuffix ? (
                                <span className="text-destructive font-medium">
                                  {" "}
                                  {expiredSuffix}
                                </span>
                              ) : null}
                            </p>
                            <p className="text-xs mt-0.5">{companiesLabel}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0" />
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
