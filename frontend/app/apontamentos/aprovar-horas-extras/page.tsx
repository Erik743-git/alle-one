"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Clock,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";

import AppShell from "@/components/layout/app-shell";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { toDateInputValue } from "@/components/rendimento/rendimento-calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";
import { Label } from "@/components/ui/label";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { getStoredUser } from "@/lib/session";
import { notifyError, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  rendimentoService,
  type PendingOvertimeItem,
  type RendimentoCollaborator,
} from "@/lib/services/rendimento.service";

function monthRangeFor(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    start: toDateInputValue(start),
    end: toDateInputValue(end),
  };
}

function formatDateBr(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export default function AprovarHorasExtrasPage() {
  const router = useRouter();
  const authUser = getStoredUser();
  const isAdmin = authUser?.role === "ADMIN";

  const defaultRange = useMemo(() => monthRangeFor(new Date()), []);

  const [start, setStart] = useState(defaultRange.start);
  const [end, setEnd] = useState(defaultRange.end);
  const [userId, setUserId] = useState("");
  const [collaborators, setCollaborators] = useState<RendimentoCollaborator[]>(
    [],
  );
  const [loadingCollaborators, setLoadingCollaborators] = useState(true);
  const [items, setItems] = useState<PendingOvertimeItem[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState(false);

  const userOptions = useMemo(
    () => collaborators.map((c) => ({ value: c.id, label: c.name })),
    [collaborators],
  );

  const selectedIds = useMemo(
    () => items.filter((row) => selected[row.id]).map((row) => row.id),
    [items, selected],
  );

  const allVisibleSelected =
    items.length > 0 && items.every((row) => selected[row.id]);

  const load = useCallback(
    async (silent = false) => {
      try {
        if (silent) setRefreshing(true);
        else setLoading(true);
        const data = await rendimentoService.listPendingOvertime({
          start,
          end,
          userId: userId || undefined,
        });
        setItems(data);
        setSelected((prev) => {
          const next: Record<string, boolean> = {};
          for (const row of data) {
            if (prev[row.id]) next[row.id] = true;
          }
          return next;
        });
      } catch (err) {
        notifyError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar horas extras pendentes.",
        );
        setItems([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [end, start, userId],
  );

  useEffect(() => {
    if (!isAdmin) {
      router.replace("/dashboard");
      return;
    }
    void (async () => {
      try {
        setLoadingCollaborators(true);
        const list = await rendimentoService.listCollaborators();
        setCollaborators(list);
      } catch {
        /* lista de filtro opcional */
      } finally {
        setLoadingCollaborators(false);
      }
    })();
  }, [isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
  }, [isAdmin, load]);

  function toggleAllVisible() {
    if (allVisibleSelected) {
      setSelected({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const row of items) {
      next[row.id] = true;
    }
    setSelected(next);
  }

  async function decideOne(id: string, decision: "APPROVED" | "REJECTED") {
    try {
      setActing(true);
      await rendimentoService.decideDayEvent({ id, decision });
      notifySuccess(
        decision === "APPROVED"
          ? "Hora extra aprovada."
          : "Hora extra rejeitada.",
      );
      await load(true);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível concluir a ação.",
      );
    } finally {
      setActing(false);
    }
  }

  async function decideBulk(decision: "APPROVED" | "REJECTED") {
    if (!selectedIds.length) {
      notifyError("Selecione ao menos um registro da lista.");
      return;
    }
    try {
      setActing(true);
      const res = await rendimentoService.bulkDecideDayEvents({
        ids: selectedIds,
        decision,
      });
      if (res.failed > 0) {
        notifyError(
          `${res.succeeded} de ${res.total} processado(s). ${res.failed} falha(s).`,
        );
      } else {
        notifySuccess(
          decision === "APPROVED"
            ? `${res.succeeded} hora(s) extra(s) aprovada(s).`
            : `${res.succeeded} hora(s) extra(s) rejeitada(s).`,
        );
      }
      await load(true);
    } catch (err) {
      notifyError(
        err instanceof Error
          ? err.message
          : "Não foi possível processar em massa.",
      );
    } finally {
      setActing(false);
    }
  }

  return (
    <ProtectedPage>
      <PermissionGate module="RENDIMENTO">
        <AppShell>
          <div className="font-sans w-full space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <Button asChild variant="outline" size="sm" className="w-fit">
                  <Link href="/apontamentos">
                    <ArrowLeft className="mr-2 size-4" />
                    Voltar aos apontamentos
                  </Link>
                </Button>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Clock size={24} />
                </div>
                <h1 className="text-3xl font-bold text-foreground">
                  Aprovar horas extras
                </h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Horas extras e plantões registrados no TiFlux aguardando
                  aprovação do administrador. O período inicia no mês atual;
                  use os filtros para refinar a lista.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={refreshing || loading || acting}
                onClick={() => void load(true)}
              >
                <RefreshCw
                  className={cn("mr-2 size-4", refreshing && "animate-spin")}
                />
                Atualizar
              </Button>
            </div>

            <Card className="overflow-visible">
              <CardHeader>
                <CardTitle className="text-base">Filtros</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    De
                  </Label>
                  <DatePickerField
                    value={start}
                    onChange={setStart}
                    max={end || undefined}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Até
                  </Label>
                  <DatePickerField
                    value={end}
                    onChange={setEnd}
                    min={start || undefined}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Usuário
                  </Label>
                  <SearchableSelectField
                    value={userId}
                    onChange={setUserId}
                    options={userOptions}
                    loading={loadingCollaborators}
                    disabled={loadingCollaborators}
                    emptyLabel="Todos os usuários"
                    placeholder="Todos os usuários"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">
                  Pendentes ({items.length})
                </CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={acting || !selectedIds.length}
                    onClick={() => void decideBulk("APPROVED")}
                  >
                    <Check className="mr-2 size-4" />
                    Aprovar selecionados ({selectedIds.length})
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={acting || !selectedIds.length}
                    onClick={() => void decideBulk("REJECTED")}
                  >
                    <X className="mr-2 size-4" />
                    Rejeitar selecionados
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                {loading ? (
                  <div className="flex min-h-[200px] items-center justify-center">
                    <Loader2 className="size-8 animate-spin text-primary" />
                  </div>
                ) : items.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Nenhuma hora extra ou plantão pendente no período.
                  </p>
                ) : (
                  <table className="w-full min-w-[960px] text-left text-sm">
                    <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 w-12">
                          <label className="flex cursor-pointer items-center justify-center">
                            <FlipCheckbox
                              checked={allVisibleSelected}
                              onChange={toggleAllVisible}
                              aria-label="Marcar todos visíveis"
                            />
                          </label>
                        </th>
                        <th className="px-4 py-3">Usuário</th>
                        <th className="px-4 py-3">Data</th>
                        <th className="px-4 py-3">Horário</th>
                        <th className="px-4 py-3">Duração</th>
                        <th className="px-4 py-3">Tipo</th>
                        <th className="px-4 py-3">Descrição</th>
                        <th className="px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((row) => (
                        <tr
                          key={row.id}
                          className="border-t border-border align-top hover:bg-muted/20"
                        >
                          <td className="px-4 py-3">
                            <label className="flex cursor-pointer items-center justify-center">
                              <FlipCheckbox
                                checked={Boolean(selected[row.id])}
                                onChange={(e) =>
                                  setSelected((prev) => ({
                                    ...prev,
                                    [row.id]: e.target.checked,
                                  }))
                                }
                                aria-label={`Selecionar ${row.userName}`}
                              />
                            </label>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium">{row.userName}</div>
                            <div className="text-xs text-muted-foreground">
                              {row.userEmail}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {formatDateBr(row.date)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {row.fromTime && row.toTime
                              ? `${row.fromTime} – ${row.toTime}`
                              : "—"}
                          </td>
                          <td className="px-4 py-3 font-medium text-primary">
                            {row.hoursFormatted}
                          </td>
                          <td className="px-4 py-3">{row.typeLabel}</td>
                          <td className="px-4 py-3 max-w-xs text-muted-foreground">
                            {row.description?.trim() || row.label || "—"}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="flex justify-end gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={acting}
                                onClick={() =>
                                  void decideOne(row.id, "APPROVED")
                                }
                              >
                                Aprovar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={acting}
                                onClick={() =>
                                  void decideOne(row.id, "REJECTED")
                                }
                              >
                                Rejeitar
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
