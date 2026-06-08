"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/layout/app-shell";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  adminService,
  type AuditLogItem,
} from "@/lib/services/admin.service";
import { notifyError, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR");
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function AdminAuditoriaPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);

  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [actorId, setActorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [page, setPage] = useState(1);
  const [reprocessing, setReprocessing] = useState(false);
  const pageSize = 50;

  const offset = (page - 1) * pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const canPrev = page > 1;
  const canNext = page < totalPages;

  const effectiveQuery = useMemo(
    () => ({
      offset,
      limit: pageSize,
      order: "desc" as const,
      entity: entity.trim() || undefined,
      action: action.trim() || undefined,
      actorId: actorId.trim() || undefined,
      from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
    }),
    [offset, entity, action, actorId, from, to],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const res = await adminService.listAuditLogs(effectiveQuery);
        if (cancelled) return;
        setItems(res.items ?? []);
        setTotal(res.total ?? 0);
      } catch (err) {
        if (!cancelled) {
          setItems([]);
          setTotal(0);
          notifyError(err instanceof Error ? err.message : "Falha ao carregar auditoria.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [effectiveQuery]);

  return (
    <ProtectedPage>
      <PermissionGate module="ADMIN">
        <AppShell>
          <div className="font-sans w-full space-y-6">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-foreground">Auditoria</h1>
              <p className="text-muted-foreground">
                Ações administrativas registradas no portal (create/update/delete/aprovações).
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Manutenção — alertas de rendimento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Recalcula lacunas e almoço persistidos com as regras atuais (últimos 6 meses,
                  todos os colaboradores com TiFlux). Não altera HE/plantão já aprovados.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={reprocessing}
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Reprocessar alertas de rendimento para todos os colaboradores (últimos 6 meses)?",
                      )
                    ) {
                      return;
                    }
                    void (async () => {
                      try {
                        setReprocessing(true);
                        const res = await adminService.reprocessRendimentoAlerts();
                        notifySuccess(
                          `${res.message} (${res.usersProcessed} colaborador(es), ${res.eventsPurged} removido(s), ${res.eventsUpserted} recriado(s))`,
                        );
                      } catch (err) {
                        notifyError(
                          err instanceof Error
                            ? err.message
                            : "Falha ao reprocessar alertas.",
                        );
                      } finally {
                        setReprocessing(false);
                      }
                    })();
                  }}
                >
                  {reprocessing ? "Reprocessando…" : "Reprocessar alertas (6 meses)"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Filtros</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Entidade</p>
                  <Input
                    value={entity}
                    onChange={(e) => setEntity(e.target.value)}
                    placeholder="Ex.: User, Gmud"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Ação</p>
                  <Input
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                    placeholder="Ex.: CREATE, DECIDE"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Actor (userId)</p>
                  <Input
                    value={actorId}
                    onChange={(e) => setActorId(e.target.value)}
                    placeholder="UUID admin"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">De</p>
                  <Input
                    type="date"
                    value={from}
                    onChange={(e) => {
                      setFrom(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Até</p>
                  <Input
                    type="date"
                    value={to}
                    onChange={(e) => {
                      setTo(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <CardTitle>Registros</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canPrev}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Anterior
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Página {page} de {totalPages} · {total} itens
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canNext}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-2xl border border-border">
                  <table className="min-w-[980px] w-full text-left text-sm">
                    <thead className="bg-primary/15 text-foreground">
                      <tr>
                        <th className="px-4 py-3">Quando</th>
                        <th className="px-4 py-3">Admin</th>
                        <th className="px-4 py-3">Ação</th>
                        <th className="px-4 py-3">Entidade</th>
                        <th className="px-4 py-3">EntityId</th>
                        <th className="px-4 py-3">Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td className="px-4 py-4 text-muted-foreground" colSpan={6}>
                            Carregando…
                          </td>
                        </tr>
                      ) : items.length === 0 ? (
                        <tr>
                          <td className="px-4 py-4 text-muted-foreground" colSpan={6}>
                            Nenhum registro encontrado.
                          </td>
                        </tr>
                      ) : (
                        items.map((row) => (
                          <tr key={row.id} className="border-t border-border/60 align-top">
                            <td className="px-4 py-3 whitespace-nowrap">
                              {formatDateTime(row.createdAt)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-semibold">
                                {row.user?.name ?? "—"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {row.user?.email ?? row.userId ?? "—"}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn("font-semibold", row.action.includes("[ERROR]") && "text-destructive")}>
                                {row.action}
                              </span>
                            </td>
                            <td className="px-4 py-3">{row.entity}</td>
                            <td className="px-4 py-3">{row.entityId ?? "—"}</td>
                            <td className="px-4 py-3">
                              <details className="max-w-[520px]">
                                <summary className="cursor-pointer select-none text-primary font-semibold">
                                  Ver JSON
                                </summary>
                                <pre className="mt-2 max-h-72 overflow-auto rounded-xl border border-border bg-muted/30 p-3 text-xs">
                                  {prettyJson(row.payload)}
                                </pre>
                              </details>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}

