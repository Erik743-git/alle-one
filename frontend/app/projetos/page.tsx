"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  ChevronRight,
  FolderKanban,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";

import AppShell from "@/components/layout/app-shell";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { isClient } from "@/lib/access-control";
import { notifyError } from "@/lib/notify";
import {
  projetosService,
  type ProjectCompany,
} from "@/lib/services/projetos.service";

export default function ProjetosPage() {
  const router = useRouter();
  const clientUser = isClient();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [companies, setCompanies] = useState<ProjectCompany[]>([]);
  const [search, setSearch] = useState("");

  const load = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      const data = await projetosService.listCompanies();
      const list = Array.isArray(data) ? data : [];
      setCompanies(list);
      if (clientUser && list.length === 1) {
        router.replace(`/projetos/${list[0].id}`);
      }
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível carregar as empresas.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clientUser, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const list = Array.isArray(companies) ? companies : [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => (c.name ?? "").toLowerCase().includes(q));
  }, [companies, search]);

  const redirectingClient =
    clientUser &&
    (loading || ((companies?.length ?? 0) === 1 && !search.trim()));

  return (
    <ProtectedPage>
      <PermissionGate module="PROJECTS">
        <AppShell>
          <div className="font-sans w-full space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                  <FolderKanban className="h-7 w-7 text-primary" />
                  Projetos
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {clientUser
                    ? "Cronogramas e atividades da sua empresa."
                    : "Selecione uma empresa para ver os projetos."}
                </p>
              </div>
              {!clientUser ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading || refreshing}
                  onClick={() => void load(true)}
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                  />
                  Atualizar
                </Button>
              ) : null}
            </div>

            {!clientUser ? (
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar empresa..."
                  className="pl-9"
                />
              </div>
            ) : null}

            {redirectingClient || loading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Carregando...
              </div>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Nenhuma empresa encontrada.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {filtered.map((company) => (
                  <Link
                    key={company.id}
                    href={`/projetos/${company.id}`}
                    className="group flex items-center justify-between rounded-xl border bg-card px-4 py-4 transition hover:border-primary/40 hover:bg-accent/30"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{company.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {company.projectsCount}{" "}
                          {company.projectsCount === 1 ? "projeto" : "projetos"}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
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
