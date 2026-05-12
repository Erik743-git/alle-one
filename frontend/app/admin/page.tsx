"use client";

import { useEffect, useState } from "react";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import AppShell from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import {
  Building2,
  Users,
  ArrowRight,
  ShieldCheck,
  FileText,
  LayoutDashboard,
} from "lucide-react";
import Link from "next/link";
import {
  adminService,
  type AdminOverviewStats,
} from "@/lib/services/admin.service";

export default function AdminPage() {
  const [stats, setStats] = useState<AdminOverviewStats | null>(null);
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await adminService.overviewStats();
        if (!cancelled) {
          setStats(data);
          setStatsError(false);
        }
      } catch {
        if (!cancelled) {
          setStats(null);
          setStatsError(true);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const modules = [
    {
      name: "Empresas",
      description:
        "Gerencie empresas, informações gerais, contratos e documentos.",
      icon: Building2,
      href: "/admin/empresas",
    },
    {
      name: "Usuários",
      description:
        "Crie, edite, exclua usuários e defina permissões por empresa.",
      icon: Users,
      href: "/admin/usuarios",
    },
  ];

  const companiesActive = stats?.companiesActive ?? "—";
  const usersActive = stats?.usersActive ?? "—";
  const adminUsers = stats?.adminUsers ?? "—";
  const contractFiles = stats?.contractFilesCount ?? "—";

  return (
    <ProtectedPage>
      <PermissionGate module="ADMIN">
      <AppShell>
        <div className="font-sans w-full space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-foreground">Administração</h1>
            <p className="text-muted-foreground">
              Gerencie empresas, usuários, permissões e documentos do portal.
            </p>
            {statsError ? (
              <p className="text-sm text-amber-400/90">
                Não foi possível carregar os indicadores. Verifique sua sessão e
                tente novamente.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="flex min-h-[132px] items-center justify-between p-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground">
                    Empresas ativas
                  </p>
                  <p className="text-3xl font-bold">{companiesActive}</p>
                </div>

                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Building2 size={28} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex min-h-[132px] items-center justify-between p-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground">
                    Usuários ativos
                  </p>
                  <p className="text-3xl font-bold">{usersActive}</p>
                </div>

                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/12 text-green-400">
                  <Users size={28} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex min-h-[132px] items-center justify-between p-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground">
                    Perfis ADMIN
                  </p>
                  <p className="text-3xl font-bold">{adminUsers}</p>
                </div>

                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/12 text-orange-400">
                  <ShieldCheck size={28} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex min-h-[132px] items-center justify-between p-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground">
                    Arquivos de contrato
                  </p>
                  <p className="text-3xl font-bold">{contractFiles}</p>
                </div>

                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/12 text-violet-400">
                  <FileText size={28} />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {modules.map((module) => {
                const Icon = module.icon;

                return (
                  <Link key={module.name} href={module.href} className="group">
                    <Card className="h-full overflow-hidden transition duration-300 hover:border-primary/40 hover:bg-muted/40 hover:shadow-[0_0_0_1px_rgba(18,181,217,0.12),0_20px_40px_rgba(0,0,0,0.28)]">
                      <CardContent className="flex h-full min-h-[230px] flex-col justify-between p-6">
                        <div className="space-y-5">
                          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition group-hover:bg-primary/15">
                            <Icon size={28} />
                          </div>

                          <div className="space-y-2">
                            <h2 className="text-2xl font-bold tracking-tight text-foreground">
                              {module.name}
                            </h2>

                            <p className="text-sm leading-6 text-muted-foreground">
                              {module.description}
                            </p>
                          </div>
                        </div>

                        <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-primary">
                          Acessar módulo
                          <ArrowRight
                            size={16}
                            className="transition group-hover:translate-x-1"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>

            <Card>
              <CardContent className="flex h-full min-h-[230px] flex-col justify-between p-6">
                <div className="space-y-5">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <LayoutDashboard size={28} />
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">
                      Visão administrativa
                    </h2>

                    <p className="text-sm leading-6 text-muted-foreground">
                      Indicadores consolidados do cadastro de empresas, usuários
                      e arquivos vinculados aos contratos no banco do portal.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border bg-muted/40 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Empresas (total)
                      </p>
                      <p className="mt-2 text-xl font-bold text-foreground">
                        {stats?.companiesTotal ?? "—"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-muted/40 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Usuários ativos
                      </p>
                      <p className="mt-2 text-xl font-bold text-foreground">
                        {stats?.usersActive ?? "—"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                  Os números são atualizados ao abrir esta página. Perfis não
                  administrativos não acessam esta área.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
