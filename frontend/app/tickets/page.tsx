"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Filter, Loader2, Plus, RefreshCw, Search, Ticket } from "lucide-react";

import AppShell from "@/components/layout/app-shell";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  canCreateTicketsAndAppointments,
  TICKETS_CREATE_ADMIN_ONLY_MESSAGE,
} from "@/lib/access-control";
import { notifyError } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  ticketsService,
  type TicketFilterCatalogs,
  type TicketListResponse,
  type TicketsListParams,
} from "@/lib/services/tickets.service";

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TicketsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<TicketListResponse | null>(null);
  const [catalogs, setCatalogs] = useState<TicketFilterCatalogs | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [includeAllResponsibles, setIncludeAllResponsibles] = useState(false);

  const mineOnly = !includeAllResponsibles;
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [responsibleExternalId, setResponsibleExternalId] = useState("");
  const [clientExternalId, setClientExternalId] = useState("");
  const [stageName, setStageName] = useState("");
  const [statusName, setStatusName] = useState("");
  const [deskName, setDeskName] = useState("");
  const [ticketNumber, setTicketNumber] = useState("");

  const queryParams = useMemo((): TicketsListParams => {
    const parsedTicket = ticketNumber.trim() ? Number(ticketNumber.trim()) : undefined;
    return {
      mineOnly,
      responsibleExternalId:
        !mineOnly && responsibleExternalId
          ? Number(responsibleExternalId)
          : undefined,
      clientExternalId: clientExternalId ? Number(clientExternalId) : undefined,
      stageName: stageName || undefined,
      statusName: statusName || undefined,
      deskName: deskName || undefined,
      from: from || undefined,
      to: to || undefined,
      ticketNumber:
        parsedTicket != null && Number.isFinite(parsedTicket)
          ? parsedTicket
          : undefined,
      search: search.trim() || undefined,
    };
  }, [
    mineOnly,
    responsibleExternalId,
    clientExternalId,
    stageName,
    statusName,
    deskName,
    from,
    to,
    ticketNumber,
    search,
  ]);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const [list, cats] = await Promise.all([
        ticketsService.list(queryParams),
        catalogs ? Promise.resolve(catalogs) : ticketsService.catalogs(),
      ]);
      setData(list);
      if (!catalogs) setCatalogs(cats);
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível carregar os tickets.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [queryParams, catalogs]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ProtectedPage>
      <PermissionGate module="TICKETS">
        <AppShell>
          <div className="font-sans w-full space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Ticket size={24} />
                </div>
                <h1 className="text-3xl font-bold text-foreground">Tickets</h1>
                <p className="text-muted-foreground">
                  Por padrão, exibe apenas tickets em que você é o responsável.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canCreateTicketsAndAppointments() ? (
                  <Button asChild>
                    <Link href="/tickets/new">
                      <Plus className="mr-2 size-4" />
                      Novo ticket
                    </Link>
                  </Button>
                ) : (
                  <p className="max-w-sm text-xs text-muted-foreground">
                    {TICKETS_CREATE_ADMIN_ONLY_MESSAGE}
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={refreshing}
                  onClick={() => void load(true)}
                >
                  <RefreshCw className={cn("mr-2 size-4", refreshing && "animate-spin")} />
                  Atualizar
                </Button>
              </div>
            </div>

            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-lg">
                  {mineOnly
                    ? "Meus tickets"
                    : "Busca ampliada"}
                </CardTitle>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAdvanced((v) => !v)}
                >
                  <Filter className="mr-2 size-4" />
                  Busca avançada
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {data?.message ? (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
                    {data.message}
                  </p>
                ) : null}
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar por número ou título"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                {showAdvanced ? (
                  <div className="space-y-4">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-input"
                        checked={includeAllResponsibles}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setIncludeAllResponsibles(checked);
                          if (!checked) setResponsibleExternalId("");
                        }}
                      />
                      Ver tickets de outros responsáveis
                    </label>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">De</Label>
                      <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Até</Label>
                      <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Número</Label>
                      <Input
                        inputMode="numeric"
                        value={ticketNumber}
                        onChange={(e) => setTicketNumber(e.target.value)}
                        placeholder="Ex.: 69197"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Estágio</Label>
                      <select
                        className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                        value={stageName}
                        onChange={(e) => setStageName(e.target.value)}
                      >
                        <option value="">Todos</option>
                        {(catalogs?.stages ?? []).map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Cliente</Label>
                      <select
                        className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                        value={clientExternalId}
                        onChange={(e) => setClientExternalId(e.target.value)}
                      >
                        <option value="">Todos</option>
                        {(catalogs?.clients ?? []).map((c) => (
                          <option key={c.externalId} value={String(c.externalId)}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {includeAllResponsibles ? (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Responsável</Label>
                        <select
                          className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                          value={responsibleExternalId}
                          onChange={(e) => setResponsibleExternalId(e.target.value)}
                        >
                          <option value="">Todos os responsáveis</option>
                          {(catalogs?.responsibles ?? []).map((r) => (
                            <option key={r.externalId} value={String(r.externalId)}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Status</Label>
                      <select
                        className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                        value={statusName}
                        onChange={(e) => setStatusName(e.target.value)}
                      >
                        <option value="">Todos</option>
                        {(catalogs?.statuses ?? []).map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Mesa</Label>
                      <select
                        className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                        value={deskName}
                        onChange={(e) => setDeskName(e.target.value)}
                      >
                        <option value="">Todas</option>
                        {(catalogs?.desks ?? []).map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {loading ? (
              <div className="flex min-h-[240px] items-center justify-center">
                <Loader2 className="size-8 animate-spin text-primary" />
              </div>
            ) : !(data?.groups?.length) ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Nenhum ticket aberto encontrado com os filtros atuais.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {data.total} ticket(s)
                  {data.mineOnly
                    ? data.responsibleName
                      ? ` · responsável: ${data.responsibleName}`
                      : " · meus tickets"
                    : data.responsibleName
                      ? ` · responsável: ${data.responsibleName}`
                      : " · todos os responsáveis"}
                </p>
                {(data?.groups ?? []).map((group) => (
                  <Card key={group.key}>
                    <CardHeader>
                      <CardTitle className="text-base">
                        {group.label}{" "}
                        <span className="text-muted-foreground">({group.tickets.length})</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto p-0">
                      <table className="w-full min-w-[900px] text-left text-sm">
                        <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="px-4 py-2">Número</th>
                            <th className="px-4 py-2">Título</th>
                            <th className="px-4 py-2">Cliente</th>
                            <th className="px-4 py-2">Origem</th>
                            <th className="px-4 py-2">Prioridade</th>
                            <th className="px-4 py-2">Status</th>
                            <th className="px-4 py-2">Estágio</th>
                            <th className="px-4 py-2">Atualizado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.tickets.map((ticket) => (
                            <tr
                              key={ticket.ticketNumber}
                              className="border-b border-border/60 hover:bg-muted/20"
                            >
                              <td className="px-4 py-2">
                                <Link
                                  href={`/tickets/${ticket.ticketNumber}`}
                                  className="font-semibold text-primary hover:underline"
                                >
                                  #{ticket.ticketNumber}
                                </Link>
                              </td>
                              <td className="max-w-[280px] truncate px-4 py-2">
                                {ticket.title ?? "—"}
                              </td>
                              <td className="px-4 py-2">{ticket.clientName ?? "—"}</td>
                              <td className="px-4 py-2">{ticket.origin ?? "—"}</td>
                              <td className="px-4 py-2">{ticket.priorityName ?? "—"}</td>
                              <td className="px-4 py-2">{ticket.statusName ?? "—"}</td>
                              <td className="px-4 py-2">{ticket.stageName ?? "—"}</td>
                              <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                                {formatWhen(ticket.updatedAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
