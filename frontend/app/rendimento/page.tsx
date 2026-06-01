"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2, Search, Users } from "lucide-react";

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
import { notifyError } from "@/lib/notify";
import {
  rendimentoService,
  type RendimentoCollaborator,
} from "@/lib/services/rendimento.service";

export default function RendimentoPage() {
  const router = useRouter();
  const authUser = getStoredUser();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [collaborators, setCollaborators] = useState<RendimentoCollaborator[]>(
    [],
  );

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
          router.replace(`/rendimento/${authUser.id}`);
          return;
        }
        setLoading(true);
        const data = await rendimentoService.listCollaborators();
        setCollaborators(data);
      } catch (err) {
        notifyError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar os colaboradores.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [authUser?.id, authUser?.role, router]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return collaborators;
    return collaborators.filter((item) => {
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

  return (
    <ProtectedPage>
      <PermissionGate module="RENDIMENTO">
        <AppShell>
          <div className="font-sans w-full space-y-8">
            <div className="space-y-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Users size={24} />
              </div>
              <h1 className="text-3xl font-bold text-foreground">Rendimento</h1>
              <p className="text-muted-foreground">
                Acompanhe os apontamentos de horas dos colaboradores no TiFlux.
                A coluna «Horas no mês» usa total sem sobreposição no mesmo dia; na
                agenda, cada apontamento continua listado normalmente.
              </p>
            </div>

            <Card>
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-lg">Colaboradores</CardTitle>
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar nome ou e-mail..."
                    className="h-10 pl-9"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex min-h-[200px] items-center justify-center">
                    <Loader2 className="size-8 animate-spin text-primary" />
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
                        {filtered.length === 0 ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-4 py-8 text-center text-muted-foreground"
                            >
                              Nenhum colaborador encontrado.
                            </td>
                          </tr>
                        ) : (
                          filtered.map((item) => (
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
                              <td className="px-4 py-3">{roleDisplayLabel(item.role)}</td>
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
                                  <Link href={`/rendimento/${item.id}`}>
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
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
