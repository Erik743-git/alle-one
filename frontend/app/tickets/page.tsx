"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Filter, Plus, RefreshCw, Search, Ticket } from "lucide-react";

import AppShell from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { PreTicketsBadge, refreshPreTicketsBadge } from "@/components/layout/pre-tickets-badge";
import ProtectedPage from "@/components/auth/protected-page";
import PermissionGate from "@/components/auth/permission-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { FlipCheckbox } from "@/components/ui/flip-checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelectField } from "@/components/ui/searchable-select-field";
import { Skeleton } from "@/components/ui/skeleton";
import {
  canCreateTicket,
  isClient,
  TICKETS_CREATE_ADMIN_ONLY_MESSAGE,
} from "@/lib/access-control";
import { TICKETS_LIST_SUBTITLE, TICKETS_CLIENT_LIST_SUBTITLE } from "@/lib/module-copy";
import { notifyError } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  ticketsService,
  type TicketFilterCatalogs,
  type TicketListResponse,
  type TicketsListParams,
} from "@/lib/services/tickets.service";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<TicketListResponse | null>(null);
  const [catalogs, setCatalogs] = useState<TicketFilterCatalogs | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [includeAllResponsibles, setIncludeAllResponsibles] = useState(
    () => isClient(),
  );

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
  const [externalGmudRef, setExternalGmudRef] = useState("");

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
      externalGmudRef: externalGmudRef.trim() || undefined,
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
    externalGmudRef,
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
      refreshPreTicketsBadge();
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

  const stageOptions = useMemo(
    () => [
      { value: "", label: "Todos os estágios" },
      ...(catalogs?.stages ?? []).map((s) => ({ value: s, label: s })),
    ],
    [catalogs],
  );

  const clientOptions = useMemo(
    () => [
      { value: "", label: "Todos os clientes" },
      ...(catalogs?.clients ?? []).map((c) => ({
        value: String(c.externalId),
        label: c.name,
      })),
    ],
    [catalogs],
  );

  const responsibleOptions = useMemo(
    () => [
      { value: "", label: "Todos os responsáveis" },
      ...(catalogs?.responsibles ?? []).map((r) => ({
        value: String(r.externalId),
        label: r.name,
      })),
    ],
    [catalogs],
  );

  const statusOptions = useMemo(
    () => [
      { value: "", label: "Todos os status" },
      ...(catalogs?.statuses ?? []).map((s) => ({ value: s, label: s })),
    ],
    [catalogs],
  );

  const deskOptions = useMemo(
    () => [
      { value: "", label: "Todas as mesas" },
      ...(catalogs?.desks ?? []).map((d) => ({ value: d, label: d })),
    ],
    [catalogs],
  );

  return (
    <ProtectedPage>
      <PermissionGate module="TICKETS">
        <AppShell>
          <div className="font-sans w-full space-y-6">
            <PageHeader
              icon={<Ticket size={24} />}
              title="Chamados"
              description={
                isClient()
                  ? TICKETS_CLIENT_LIST_SUBTITLE
                  : canCreateTicket()
                    ? TICKETS_LIST_SUBTITLE
                    : TICKETS_CREATE_ADMIN_ONLY_MESSAGE
              }
              actions={
                <>
                  {canCreateTicket() ? (
                    <Button asChild>
                      <Link href="/tickets/new">
                        <Plus className="mr-2 size-4" />
                        Novo chamado
                      </Link>
                    </Button>
                  ) : null}
                  {!isClient() ? (
                    <Button asChild variant="outline" className="relative">
                      <Link href="/tickets/pre-tickets" className="inline-flex items-center">
                        Pré-tickets
                        <PreTicketsBadge />
                      </Link>
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={refreshing}
                    onClick={() => void load(true)}
                  >
                    <RefreshCw
                      className={cn("mr-2 size-4", refreshing && "animate-spin")}
                    />
                    Atualizar
                  </Button>
                </>
              }
            />

            <Card className="overflow-visible">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <CardTitle className="text-lg">
                    {isClient()
                      ? "Chamados da empresa"
                      : mineOnly
                        ? "Meus chamados"
                        : "Todos os chamados abertos"}
                  </CardTitle>
                  {!isClient() ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={mineOnly ? "default" : "outline"}
                        className="h-8"
                        onClick={() => {
                          setIncludeAllResponsibles(false);
                          setResponsibleExternalId("");
                        }}
                      >
                        Meus tickets
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={!mineOnly ? "default" : "outline"}
                        className="h-8"
                        onClick={() => setIncludeAllResponsibles(true)}
                      >
                        Todos os tickets
                      </Button>
                    </div>
                  ) : null}
                </div>
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
                  <p className="alle-alert-banner rounded-lg px-3 py-2 text-sm">
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
                    {!isClient() ? (
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                        <FlipCheckbox
                          checked={includeAllResponsibles}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setIncludeAllResponsibles(checked);
                            if (!checked) setResponsibleExternalId("");
                          }}
                        />
                        Incluir chamados de outros responsáveis
                      </label>
                    ) : null}
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          De
                        </Label>
                        <DatePickerField
                          value={from}
                          onChange={setFrom}
                          max={to || undefined}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          Até
                        </Label>
                        <DatePickerField
                          value={to}
                          onChange={setTo}
                          min={from || undefined}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          Número
                        </Label>
                        <Input
                          inputMode="numeric"
                          value={ticketNumber}
                          onChange={(e) => setTicketNumber(e.target.value)}
                          placeholder="Ex.: 69197"
                          className="h-11"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          GMUD (cliente)
                        </Label>
                        <Input
                          value={externalGmudRef}
                          onChange={(e) => setExternalGmudRef(e.target.value)}
                          placeholder="Ex.: GMUD-2024-001"
                          className="h-11"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          Estágio
                        </Label>
                        <SearchableSelectField
                          value={stageName}
                          onChange={setStageName}
                          options={stageOptions}
                          emptyLabel="Todos os estágios"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          Cliente
                        </Label>
                        <SearchableSelectField
                          value={clientExternalId}
                          onChange={setClientExternalId}
                          options={clientOptions}
                          emptyLabel="Todos os clientes"
                        />
                      </div>
                      {includeAllResponsibles ? (
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold text-muted-foreground">
                            Responsável
                          </Label>
                          <SearchableSelectField
                            value={responsibleExternalId}
                            onChange={setResponsibleExternalId}
                            options={responsibleOptions}
                            emptyLabel="Todos os responsáveis"
                          />
                        </div>
                      ) : null}
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          Status
                        </Label>
                        <SearchableSelectField
                          value={statusName}
                          onChange={setStatusName}
                          options={statusOptions}
                          emptyLabel="Todos os status"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-muted-foreground">
                          Mesa
                        </Label>
                        <SearchableSelectField
                          value={deskName}
                          onChange={setDeskName}
                          options={deskOptions}
                          emptyLabel="Todas as mesas"
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-48" />
                <Card>
                  <CardContent className="space-y-3 py-6">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-3/4" />
                  </CardContent>
                </Card>
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
                            <th className="px-4 py-2">GMUD</th>
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
                              key={`${group.key}-${ticket.ticketNumber}`}
                              className="cursor-pointer border-b border-border/60 hover:bg-muted/20"
                              onClick={() =>
                                router.push(`/tickets/${ticket.ticketNumber}`)
                              }
                            >
                              <td className="px-4 py-2 font-semibold text-primary">
                                #{ticket.ticketNumber}
                              </td>
                              <td className="max-w-[280px] truncate px-4 py-2">
                                {ticket.title ?? "—"}
                              </td>
                              <td className="px-4 py-2">{ticket.clientName ?? "—"}</td>
                              <td className="px-4 py-2">
                                {ticket.externalGmudRef ?? "—"}
                              </td>
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
