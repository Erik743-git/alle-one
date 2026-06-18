"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Search, Settings2, Users } from "lucide-react";

import { ApontamentosAdminHub } from "@/components/apontamentos/apontamentos-admin-hub";
import { ApontamentosCollaboratorListSettingsSheet } from "@/components/apontamentos/apontamentos-collaborator-list-settings-sheet";
import AppShell from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { monthRangeFor } from "@/lib/date-ranges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getStoredUser } from "@/lib/session";
import {
  isCollaboratorRole,
  isPjRole,
  roleDisplayLabel,
} from "@/lib/app-roles";
import { isClient } from "@/lib/access-control";
import {
  APONTAMENTOS_ADMIN_SUBTITLE,
  APONTAMENTOS_MONTH_HOURS_NOTE,
} from "@/lib/module-copy";
import { notifyError } from "@/lib/notify";
import { ensureArray } from "@/lib/utils";
import {
  rendimentoService,
  type RendimentoCollaborator,
  type RendimentoCollaboratorListPreference,
} from "@/lib/services/rendimento.service";

export default function ApontamentosPage() {
  const router = useRouter();
  const authUser = getStoredUser();
  const isAdmin = authUser?.role === "ADMIN";
  const isClientUser = isClient();

  const [loading, setLoading] = useState(true);
  const [pendingOvertimeCount, setPendingOvertimeCount] = useState<
    number | null
  >(null);
  const [pendingJustificationVoluntary, setPendingJustificationVoluntary] =
    useState<number | null>(null);
  const [pendingJustificationAlert, setPendingJustificationAlert] = useState<
    number | null
  >(null);
  const [loadingPending, setLoadingPending] = useState(true);
  const [search, setSearch] = useState("");
  const [collaborators, setCollaborators] = useState<RendimentoCollaborator[]>(
    [],
  );
  const [listPreferences, setListPreferences] = useState<
    RendimentoCollaboratorListPreference[] | null
  >(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        if (isPjRole(authUser?.role)) {
          router.replace("/dashboard");
          return;
        }
        if (
          authUser &&
          (isCollaboratorRole(authUser.role) || isPjRole(authUser.role)) &&
          authUser.id
        ) {
          router.replace(`/apontamentos/${authUser.id}`);
          return;
        }
        if (isClientUser) {
          router.replace("/financeiro");
          return;
        }
        if (!isAdmin) {
          router.replace("/dashboard");
          return;
        }
        setLoading(true);
        const [data, preferences] = await Promise.all([
          rendimentoService.listCollaborators(),
          rendimentoService.listCollaboratorListPreferences().catch(() => []),
        ]);
        setCollaborators(ensureArray(data));
        setListPreferences(ensureArray(preferences));
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
  }, [authUser?.id, authUser?.role, isAdmin, isClientUser, router]);

  useEffect(() => {
    if (!isAdmin) return;
    const range = monthRangeFor(new Date());
    void (async () => {
      try {
        setLoadingPending(true);
        const [pendingOvertime, pendingJustifications] = await Promise.all([
          rendimentoService.listPendingOvertime({
            start: range.start,
            end: range.end,
          }),
          rendimentoService.listPendingJustifications({
            start: range.start,
            end: range.end,
          }),
        ]);
        setPendingOvertimeCount(pendingOvertime.length);
        setPendingJustificationVoluntary(
          pendingJustifications.filter((item) => item.kind === "VOLUNTARY")
            .length,
        );
        setPendingJustificationAlert(
          pendingJustifications.filter((item) => item.kind === "ALERT").length,
        );
      } catch {
        setPendingOvertimeCount(null);
        setPendingJustificationVoluntary(null);
        setPendingJustificationAlert(null);
      } finally {
        setLoadingPending(false);
      }
    })();
  }, [isAdmin]);

  const hiddenCollaboratorIds = useMemo(() => {
    if (!listPreferences) return new Set<string>();
    return new Set(
      listPreferences
        .filter((item) => !item.listed)
        .map((item) => item.collaboratorId),
    );
  }, [listPreferences]);

  const visibleCollaborators = useMemo(() => {
    return ensureArray(collaborators).filter(
      (item) => !hiddenCollaboratorIds.has(item.id),
    );
  }, [collaborators, hiddenCollaboratorIds]);

  const filteredCollaborators = useMemo(() => {
    const list = visibleCollaborators;
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
  }, [visibleCollaborators, search]);

  return (
    <ProtectedPage>
      <PermissionGate module="RENDIMENTO">
        <AppShell>
          <div className="font-sans w-full space-y-8">
            <PageHeader
              icon={<Users size={24} />}
              title="Apontamentos"
              description={APONTAMENTOS_ADMIN_SUBTITLE}
              actions={
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-11 shrink-0"
                  aria-label="Configurar lista de colaboradores"
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings2 className="size-5" />
                </Button>
              }
            />

            <ApontamentosCollaboratorListSettingsSheet
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
              onPreferencesChange={setListPreferences}
            />

            <ApontamentosAdminHub
              collaboratorCount={visibleCollaborators.length}
              pendingOvertimeCount={pendingOvertimeCount}
              pendingJustificationVoluntary={pendingJustificationVoluntary}
              pendingJustificationAlert={pendingJustificationAlert}
              loadingPending={loadingPending}
            />

            <Card>
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-lg">Colaboradores</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {APONTAMENTOS_MONTH_HOURS_NOTE}
                  </p>
                </div>
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar nome ou e-mail..."
                    className="h-11 pl-9"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-scroll rounded-xl border border-border [scrollbar-gutter:stable]">
                    <table className="w-full min-w-[720px] text-left font-sans text-sm">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 text-xs font-semibold uppercase">
                            Nome
                          </th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase">
                            E-mail
                          </th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase">
                            Perfil
                          </th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase">
                            Horas no mês
                          </th>
                          <th className="px-4 py-3 text-xs font-semibold uppercase">
                            Vínculo
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase">
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
                                  ? item.tifluxUserName ??
                                    `ID ${item.tifluxUserId}`
                                  : "Não vinculado"}
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
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
