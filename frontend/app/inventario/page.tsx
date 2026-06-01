"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  ChevronRight,
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
import { notifyError } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  inventarioService,
  type InventoryCompany,
} from "@/lib/services/inventario.service";

export default function InventarioPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [companies, setCompanies] = useState<InventoryCompany[]>([]);
  const [search, setSearch] = useState("");

  const load = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      const data = await inventarioService.listCompanies();
      setCompanies(data);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível carregar as empresas.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, search]);

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
                  Selecione uma empresa para ver e gerenciar os ativos do inventário.
                </p>
              </div>
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
            </div>

            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar empresa…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {loading ? (
              <div className="flex min-h-[30vh] items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                Carregando empresas…
              </div>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Nenhuma empresa encontrada.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((company) => (
                  <Link key={company.id} href={`/inventario/${company.id}`}>
                    <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/30">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Building2 className="h-4 w-4 shrink-0 text-primary" />
                          <span className="truncate">{company.name}</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>
                          {company.assetsCount}{" "}
                          {company.assetsCount === 1 ? "ativo" : "ativos"}
                        </span>
                        <ChevronRight className="h-4 w-4" />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
