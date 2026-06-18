"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  FileText,
  Loader2,
  MoreVertical,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

import AppShell from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { CompactExpandableText } from "@/components/ui/compact-expandable-text";
import { JustificationKindBadge } from "@/components/rendimento/justification-kind-badge";
import { ApprovalAuditCell } from "@/components/apontamentos/approval-audit-cell";
import { RENDIMENTO_DEBIT_OVERTIME_LABEL } from "@/lib/module-copy";
import { BulkApprovalStatusFilterField } from "@/components/apontamentos/bulk-approval-status-filter";
import { monthRangeFor } from "@/lib/date-ranges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";
import { Label } from "@/components/ui/label";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { getStoredUser } from "@/lib/session";
import { notifyError, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  DEFAULT_BULK_STATUS_FILTERS,
  bulkApprovalEmptyMessage,
  bulkApprovalListTitle,
  emailLocalPart,
  formatDateBr,
  includesPendingFilter,
  isBulkRowDecided,
  pendingBulkRows,
  syncBulkSelection,
  type BulkApprovalStatusFilter,
} from "@/lib/apontamentos/bulk-approval";
import {
  rendimentoService,
  type PendingJustificationItem,
  type RendimentoCollaborator,
} from "@/lib/services/rendimento.service";

export default function AprovarJustificativasPage() {
  const router = useRouter();
  const authUser = getStoredUser();
  const isAdmin = authUser?.role === "ADMIN";

  const defaultRange = useMemo(() => monthRangeFor(new Date()), []);

  const [start, setStart] = useState(defaultRange.start);
  const [end, setEnd] = useState(defaultRange.end);
  const [userId, setUserId] = useState("");
  const [statusFilters, setStatusFilters] = useState<BulkApprovalStatusFilter[]>(
    [...DEFAULT_BULK_STATUS_FILTERS],
  );
  const [collaborators, setCollaborators] = useState<RendimentoCollaborator[]>(
    [],
  );
  const [loadingCollaborators, setLoadingCollaborators] = useState(true);
  const [items, setItems] = useState<PendingJustificationItem[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState(false);

  const userOptions = useMemo(
    () => collaborators.map((c) => ({ value: c.id, label: c.name })),
    [collaborators],
  );

  const pendingItems = useMemo(() => pendingBulkRows(items), [items]);

  const selectedIds = useMemo(
    () =>
      pendingItems
        .filter((row) => selected[row.id])
        .map((row) => row.id),
    [pendingItems, selected],
  );

  const allPendingSelected =
    pendingItems.length > 0 &&
    pendingItems.every((row) => selected[row.id]);

  const load = useCallback(
    async (silent = false) => {
      try {
        if (silent) setRefreshing(true);
        else setLoading(true);
        const data = await rendimentoService.listPendingJustifications({
          start,
          end,
          userId: userId || undefined,
          statusFilters,
        });
        setItems(data);
        setSelected((prev) => syncBulkSelection(data, prev));
      } catch (err) {
        notifyError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar justificativas pendentes.",
        );
        setItems([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [end, start, statusFilters, userId],
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
    if (allPendingSelected) {
      setSelected((prev) => {
        const next = { ...prev };
        for (const row of pendingItems) {
          delete next[row.id];
        }
        return syncBulkSelection(items, next);
      });
      return;
    }
    setSelected((prev) => {
      const next = { ...prev };
      for (const row of pendingItems) {
        next[row.id] = true;
      }
      return syncBulkSelection(items, next);
    });
  }

  async function decideOne(id: string, decision: "APPROVED" | "REJECTED") {
    try {
      setActing(true);
      await rendimentoService.decideJustification({ id, decision });
      notifySuccess(
        decision === "APPROVED"
          ? "Justificativa aprovada."
          : "Justificativa não aprovada.",
      );
      await load(true);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Não foi possível concluir a ação.");
    } finally {
      setActing(false);
    }
  }

  async function deleteOne(id: string) {
    if (
      !window.confirm(
        "Excluir esta justificativa? O registro será removido da agenda e não poderá ser recuperado.",
      )
    ) {
      return;
    }
    try {
      setActing(true);
      await rendimentoService.deleteJustification(id);
      notifySuccess("Justificativa excluída.");
      await load(true);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível excluir.",
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
      const res = await rendimentoService.bulkDecideJustifications({
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
            ? `${res.succeeded} justificativa(s) aprovada(s).`
            : `${res.succeeded} justificativa(s) não aprovada(s).`,
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
            <PageHeader
              backHref="/apontamentos"
              backLabel="Voltar aos apontamentos"
              icon={<FileText size={24} />}
              title="Aprovar justificativas"
              description="Justificativas voluntárias e de alerta aguardando análise. Voluntária é iniciada pelo colaborador; alerta vem de lacunas detectadas na agenda."
              actions={
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
              }
            />

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
                <BulkApprovalStatusFilterField
                  value={statusFilters}
                  onChange={setStatusFilters}
                  disabled={loading || acting}
                  className="sm:col-span-2 lg:col-span-4"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">
                  {bulkApprovalListTitle(statusFilters, items)}
                </CardTitle>
                {includesPendingFilter(statusFilters) ? (
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
                    Não aprovar selecionados
                  </Button>
                </div>
                ) : null}
              </CardHeader>
              <CardContent className="overflow-x-scroll p-0 [scrollbar-gutter:stable]">
                {loading ? (
                  <div className="flex min-h-[200px] items-center justify-center">
                    <Loader2 className="size-8 animate-spin text-primary" />
                  </div>
                ) : items.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {bulkApprovalEmptyMessage(statusFilters, "justification")}
                  </p>
                ) : (
                  <table className="w-full min-w-[1280px] text-left text-sm">
                    <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="w-12 px-4 py-3">
                          <label
                            className={cn(
                              "flex items-center justify-center",
                              pendingItems.length > 0
                                ? "cursor-pointer"
                                : "cursor-not-allowed opacity-50",
                            )}
                          >
                            <FlipCheckbox
                              checked={allPendingSelected}
                              disabled={pendingItems.length === 0}
                              onChange={toggleAllVisible}
                              aria-label="Marcar todos pendentes"
                            />
                          </label>
                        </th>
                        <th className="px-4 py-3">Usuário</th>
                        <th className="px-4 py-3">Empresa</th>
                        <th className="px-4 py-3">Data</th>
                        <th className="px-4 py-3">Horário</th>
                        <th className="px-4 py-3">Tipo</th>
                        <th className="px-4 py-3">Abate saldo HE</th>
                        <th className="px-4 py-3">Lacuna</th>
                        <th className="px-4 py-3">Motivo</th>
                        <th className="px-4 py-3">Aprovação</th>
                        <th className="w-12 px-4 py-3 text-right" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((row) => {
                        const decided = isBulkRowDecided(row.status);
                        const abateSaldoHe =
                          row.adjustsOvertimeBalance ?? row.debitOvertime;
                        const abateSaldoHeLabel =
                          row.adjustsOvertimeBalanceLabel ??
                          (abateSaldoHe ? "Sim" : "Não");
                        return (
                        <tr
                          key={row.id}
                          className={cn(
                            "border-t border-border align-top hover:bg-muted/20",
                            decided && "bg-muted/30 opacity-90",
                          )}
                        >
                          <td className="px-4 py-3">
                            <label
                              className={cn(
                                "flex items-center justify-center",
                                decided ? "cursor-not-allowed" : "cursor-pointer",
                              )}
                            >
                              <FlipCheckbox
                                checked={Boolean(selected[row.id])}
                                disabled={decided}
                                onChange={(e) =>
                                  setSelected((prev) => ({
                                    ...prev,
                                    [row.id]: e.target.checked,
                                  }))
                                }
                                aria-label={`Selecionar ${emailLocalPart(row.userEmail)}`}
                              />
                            </label>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-medium">
                            {emailLocalPart(row.userEmail)}
                          </td>
                          <td className="max-w-[12rem] px-4 py-3 font-medium text-foreground">
                            {row.companyName || "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {formatDateBr(row.date)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {row.fromTime && row.toTime
                              ? `${row.fromTime} – ${row.toTime}`
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <JustificationKindBadge
                              kind={row.kind}
                              label={row.kindLabel}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              <span
                                className={cn(
                                  "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                                  abateSaldoHe
                                    ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                                    : "bg-muted text-muted-foreground",
                                )}
                                title={RENDIMENTO_DEBIT_OVERTIME_LABEL}
                              >
                                {abateSaldoHeLabel}
                              </span>
                              {abateSaldoHe ? (
                                <p className="text-xs text-muted-foreground">
                                  {row.overtimeFormatted}
                                </p>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            <p className="font-medium text-foreground/90">
                              {row.gapTypeLabel}
                            </p>
                            <p className="text-xs">{row.gapLabel}</p>
                          </td>
                          <td className="max-w-xs px-4 py-3">
                            <CompactExpandableText text={row.reason} maxLines={3} />
                          </td>
                          <td className="px-4 py-3 align-top">
                            <ApprovalAuditCell
                              status={row.status}
                              approvedByName={row.approvedByName}
                              approvedAt={row.approvedAt}
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <DropdownMenu modal={false}>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  disabled={acting}
                                  aria-label={`Ações para ${emailLocalPart(row.userEmail)}`}
                                >
                                  <MoreVertical className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                sideOffset={6}
                                className="min-w-[9.5rem] w-auto"
                              >
                                <DropdownMenuItem
                                  disabled={acting || decided}
                                  onClick={() =>
                                    void decideOne(row.id, "APPROVED")
                                  }
                                >
                                  <Check className="mr-2 size-4 text-emerald-600" />
                                  Aprovar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={acting || decided}
                                  variant="destructive"
                                  onClick={() =>
                                    void decideOne(row.id, "REJECTED")
                                  }
                                >
                                  <X className="mr-2 size-4" />
                                  Não aprovar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={acting}
                                  variant="destructive"
                                  onClick={() => void deleteOne(row.id)}
                                >
                                  <Trash2 className="mr-2 size-4" />
                                  Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                        );
                      })}
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
