"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Filter,
  Loader2,
  Mail,
  RefreshCw,
} from "lucide-react";

import AppShell from "@/components/layout/app-shell";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { notifyError, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { MailboxKindFilterModal } from "@/components/correio/mailbox-kind-filter-modal";
import { loadMailboxKindFilters, saveMailboxKindFilters } from "@/lib/mailbox-filters";
import {
  ALL_MAILBOX_KINDS,
  mailboxKindLabel,
  mailboxService,
  type MailboxNotification,
  type MailboxNotificationKind,
} from "@/lib/services/mailbox.service";

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CorreioPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<MailboxNotification[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [kindFilters, setKindFilters] = useState<MailboxNotificationKind[]>(() => [
    ...ALL_MAILBOX_KINDS,
  ]);
  const [kindModalOpen, setKindModalOpen] = useState(false);

  useEffect(() => {
    setKindFilters(loadMailboxKindFilters());
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await mailboxService.list();
      setItems(data);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível carregar o correio.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const countsByKind = useMemo(() => {
    const map: Partial<Record<MailboxNotificationKind, number>> = {};
    for (const item of items) {
      map[item.kind] = (map[item.kind] ?? 0) + 1;
    }
    return map;
  }, [items]);

  const visible = useMemo(() => {
    let list = items.filter((item) => kindFilters.includes(item.kind));
    if (filter === "unread") list = list.filter((item) => !item.readAt);
    return list;
  }, [filter, items, kindFilters]);

  const kindFilterActive = kindFilters.length < ALL_MAILBOX_KINDS.length;

  const unreadCount = useMemo(
    () => items.filter((item) => !item.readAt).length,
    [items],
  );

  async function handleRefresh() {
    try {
      setRefreshing(true);
      await mailboxService.refresh();
      await load();
      notifySuccess("Correio atualizado.");
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Falha ao atualizar o correio.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function handleMarkRead(id: string) {
    try {
      const updated = await mailboxService.markRead(id);
      setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível marcar como lida.",
      );
    }
  }

  async function handleMarkAllRead() {
    try {
      await mailboxService.markAllRead();
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          readAt: item.readAt ?? new Date().toISOString(),
        })),
      );
      notifySuccess("Todas as mensagens foram marcadas como lidas.");
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Falha ao marcar todas como lidas.",
      );
    }
  }

  return (
    <ProtectedPage>
      <PermissionGate module="CORREIO">
        <AppShell>
          <div className="font-sans w-full space-y-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Mail size={24} />
                </div>
                <h1 className="text-3xl font-bold text-foreground">Correio</h1>
                <p className="max-w-2xl text-muted-foreground">
                  Pendências e alertas do portal: rendimento, GMUD, contratos e
                  tickets. As mensagens são atualizadas ao abrir esta página e
                  diariamente pelo sistema.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={refreshing || loading}
                  onClick={() => void handleRefresh()}
                >
                  {refreshing ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 size-4" />
                  )}
                  Atualizar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!unreadCount || loading}
                  onClick={() => void handleMarkAllRead()}
                >
                  <CheckCheck className="mr-2 size-4" />
                  Marcar todas lidas
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={filter === "all" ? "default" : "outline"}
                onClick={() => setFilter("all")}
              >
                Todas ({items.filter((i) => kindFilters.includes(i.kind)).length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filter === "unread" ? "default" : "outline"}
                onClick={() => setFilter("unread")}
              >
                Não lidas (
                {
                  items.filter((i) => kindFilters.includes(i.kind) && !i.readAt)
                    .length
                }
                )
              </Button>
              <Button
                type="button"
                size="sm"
                variant={kindFilterActive ? "secondary" : "outline"}
                onClick={() => setKindModalOpen(true)}
              >
                <Filter className="mr-2 size-4" />
                Tipos
                {kindFilterActive
                  ? ` (${kindFilters.length}/${ALL_MAILBOX_KINDS.length})`
                  : ""}
              </Button>
            </div>

            <MailboxKindFilterModal
              open={kindModalOpen}
              onOpenChange={setKindModalOpen}
              selected={kindFilters}
              countsByKind={countsByKind}
              onApply={(kinds) => {
                setKindFilters(kinds);
                saveMailboxKindFilters(kinds);
              }}
            />

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Bell className="size-5" />
                  Caixa de entrada
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex min-h-[240px] items-center justify-center">
                    <Loader2 className="size-8 animate-spin text-primary" />
                  </div>
                ) : visible.length === 0 ? (
                  <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                    <Mail className="size-10 opacity-40" />
                    <p className="text-sm">
                      {filter === "unread"
                        ? "Nenhuma mensagem não lida com os filtros atuais."
                        : kindFilterActive
                          ? "Nenhuma mensagem para os tipos selecionados. Ajuste o filtro de tipos."
                          : "Nenhuma pendência no momento."}
                    </p>
                    {kindFilterActive ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setKindModalOpen(true)}
                      >
                        <Filter className="mr-2 size-4" />
                        Filtrar tipos
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {visible.map((item) => (
                      <li
                        key={item.id}
                        className={cn(
                          "rounded-xl border px-4 py-3 transition",
                          item.readAt
                            ? "border-border bg-muted/20"
                            : "border-primary/30 bg-primary/5",
                        )}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {!item.readAt ? (
                                <span className="inline-flex size-2 rounded-full bg-primary" />
                              ) : null}
                              <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                {mailboxKindLabel(item.kind)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatWhen(item.createdAt)}
                              </span>
                            </div>
                            <p className="font-semibold text-foreground">{item.title}</p>
                            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                              {item.body}
                            </p>
                            {item.href ? (
                              <Link
                                href={item.href}
                                className="inline-flex text-sm font-medium text-primary hover:underline"
                                onClick={() => {
                                  if (!item.readAt) void handleMarkRead(item.id);
                                }}
                              >
                                Abrir
                              </Link>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            {!item.readAt ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => void handleMarkRead(item.id)}
                              >
                                Marcar lida
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  <strong>Contratos:</strong> no dia 15 de cada mês o sistema verifica o
                  consumo de horas (alerta abaixo de 30% ou acima de 70%).{" "}
                  <strong>Tickets:</strong> colaboradores recebem aviso quando um ticket
                  próprio está aberto há 24h+ sem registro de horas; administradores
                  recebem alertas de tickets sem atualização há 48h ou 7 dias.
                </span>
              </p>
            </div>
          </div>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
