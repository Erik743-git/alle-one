"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Filter, RefreshCw, Search, Ticket } from "lucide-react";

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
  ExcelColumnHeader,
  countActiveExcelFilters,
  emptyExcelFilter,
  excelFilterActive,
  valuePassesExcelFilter,
  type ExcelColumnFilterState,
  type ExcelSortDir,
} from "@/components/tickets/excel-column-header";
import { TicketListPresetDialog } from "@/components/tickets/ticket-list-preset-dialog";
import { TicketListPresetsToolbar } from "@/components/tickets/ticket-list-presets-toolbar";
import {
  TicketResponsibleSelect,
  currentUserResponsibleId,
  mapFilterResponsibles,
} from "@/components/tickets/ticket-responsible-select";
import {
  canChangeTicketStage,
  canCreateTicket,
  isClient,
  isClientGestor,
  isClientMember,
  TICKETS_CREATE_ADMIN_ONLY_MESSAGE,
} from "@/lib/access-control";
import { TICKETS_LIST_SUBTITLE, TICKETS_CLIENT_LIST_SUBTITLE } from "@/lib/module-copy";
import { PORTAL_STAGE, PORTAL_STAGES_ORDER } from "@/lib/portal-ticket-stages";
import { notifyError } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/use-auth";
import {
  ticketsService,
  type TicketFilterCatalogs,
  type TicketListItem,
  type TicketListResponse,
  type TicketsListParams,
} from "@/lib/services/tickets.service";
import { ticketListPresetsService } from "@/lib/services/ticket-list-presets.service";
import {
  TICKET_LIST_COLUMNS,
  applyPresetConfigToPageState,
  type TicketColumnKey,
  type TicketListGroupBy,
  type TicketListPageState,
  type TicketListPreset,
} from "@/lib/tickets/list-presets";
import { useRouter } from "next/navigation";

const TICKET_COLUMNS = TICKET_LIST_COLUMNS;

function isDoneStage(stageName: string | null) {
  return (
    stageName === PORTAL_STAGE.RESOLVIDO ||
    stageName === PORTAL_STAGE.ENCERRADO ||
    stageName === PORTAL_STAGE.CANCELADO
  );
}

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

function cellText(ticket: TicketListItem, key: TicketColumnKey): string {
  switch (key) {
    case "number":
      return String(ticket.ticketNumber);
    case "title":
      return ticket.title?.trim() || "—";
    case "client":
      return ticket.clientName?.trim() || "—";
    case "gmud":
      return ticket.externalGmudRef?.trim() || "—";
    case "stage":
      return ticket.stageName?.trim() || "—";
    case "responsible":
      return ticket.responsibleName?.trim() || "—";
    case "updated":
      return formatWhen(ticket.updatedAt);
    default:
      return "—";
  }
}

function compareTickets(
  a: TicketListItem,
  b: TicketListItem,
  key: TicketColumnKey,
  dir: ExcelSortDir,
): number {
  const mul = dir === "asc" ? 1 : -1;
  if (key === "number") {
    return (a.ticketNumber - b.ticketNumber) * mul;
  }
  if (key === "updated") {
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return (ta - tb) * mul;
  }
  return (
    cellText(a, key).localeCompare(cellText(b, key), "pt-BR", {
      sensitivity: "base",
      numeric: true,
    }) * mul
  );
}

function emptyColumnFilters(): Record<TicketColumnKey, ExcelColumnFilterState> {
  return {
    number: emptyExcelFilter(),
    title: emptyExcelFilter(),
    client: emptyExcelFilter(),
    gmud: emptyExcelFilter(),
    stage: emptyExcelFilter(),
    responsible: emptyExcelFilter(),
    updated: emptyExcelFilter(),
  };
}

export default function TicketsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const canReassign = canChangeTicketStage();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<TicketListResponse | null>(null);
  const [catalogs, setCatalogs] = useState<TicketFilterCatalogs | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [includeAllResponsibles, setIncludeAllResponsibles] = useState(
    () => isClientGestor(),
  );
  const [includeDone, setIncludeDone] = useState(false);
  const [columnFilters, setColumnFilters] = useState(emptyColumnFilters);
  const [sortKey, setSortKey] = useState<TicketColumnKey | null>(null);
  const [sortDir, setSortDir] = useState<ExcelSortDir | null>(null);
  const [groupBy, setGroupBy] = useState<TicketListGroupBy>("none");
  const [visibleColumns, setVisibleColumns] = useState<TicketColumnKey[]>(
    TICKET_COLUMNS.map((col) => col.key),
  );
  const [presets, setPresets] = useState<TicketListPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<TicketListPreset | null>(
    null,
  );

  const mineOnly = !includeAllResponsibles;
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [responsibleExternalId, setResponsibleExternalId] = useState("");
  const [clientExternalId, setClientExternalId] = useState("");
  const [stageName, setStageName] = useState("");
  const [deskName, setDeskName] = useState("");
  const [requestorName, setRequestorName] = useState("");
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
      deskName: deskName || undefined,
      requestorName: requestorName.trim() || undefined,
      from: from || undefined,
      to: to || undefined,
      ticketNumber:
        parsedTicket != null && Number.isFinite(parsedTicket)
          ? parsedTicket
          : undefined,
      search: search.trim() || undefined,
      externalGmudRef: externalGmudRef.trim() || undefined,
      includeDone: includeDone || undefined,
    };
  }, [
    mineOnly,
    responsibleExternalId,
    clientExternalId,
    stageName,
    deskName,
    requestorName,
    from,
    to,
    ticketNumber,
    externalGmudRef,
    search,
    includeDone,
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

  const loadPresets = useCallback(async () => {
    try {
      const rows = await ticketListPresetsService.list();
      setPresets(rows);
    } catch {
      /* presets opcionais */
    }
  }, []);

  useEffect(() => {
    void loadPresets();
  }, [loadPresets]);

  const pageState = useMemo(
    (): TicketListPageState => ({
      includeAllResponsibles,
      includeDone,
      search,
      from,
      to,
      responsibleExternalId,
      clientExternalId,
      stageName,
      deskName,
      requestorName,
      ticketNumber,
      externalGmudRef,
      groupBy,
      visibleColumns,
      columnFilters,
      sortKey,
      sortDir,
    }),
    [
      includeAllResponsibles,
      includeDone,
      search,
      from,
      to,
      responsibleExternalId,
      clientExternalId,
      stageName,
      deskName,
      requestorName,
      ticketNumber,
      externalGmudRef,
      groupBy,
      visibleColumns,
      columnFilters,
      sortKey,
      sortDir,
    ],
  );

  function clearListFilters() {
    setIncludeAllResponsibles(isClientGestor());
    setIncludeDone(false);
    setSearch("");
    setFrom("");
    setTo("");
    setResponsibleExternalId("");
    setClientExternalId("");
    setStageName("");
    setDeskName("");
    setRequestorName("");
    setTicketNumber("");
    setExternalGmudRef("");
    setGroupBy("none");
    setColumnFilters(emptyColumnFilters());
    setSortKey(null);
    setSortDir(null);
    setActivePresetId(null);
  }

  function applyPreset(preset: TicketListPreset) {
    if (activePresetId === preset.id) {
      clearListFilters();
      return;
    }
    const partial = applyPresetConfigToPageState(preset.config);
    if (partial.includeAllResponsibles !== undefined) {
      setIncludeAllResponsibles(partial.includeAllResponsibles);
    }
    if (partial.includeDone !== undefined) setIncludeDone(partial.includeDone);
    if (partial.search !== undefined) setSearch(partial.search);
    if (partial.from !== undefined) setFrom(partial.from);
    if (partial.to !== undefined) setTo(partial.to);
    if (partial.responsibleExternalId !== undefined) {
      setResponsibleExternalId(partial.responsibleExternalId);
    }
    if (partial.clientExternalId !== undefined) {
      setClientExternalId(partial.clientExternalId);
    }
    if (partial.stageName !== undefined) setStageName(partial.stageName);
    if (partial.deskName !== undefined) setDeskName(partial.deskName);
    if (partial.requestorName !== undefined) setRequestorName(partial.requestorName);
    if (partial.ticketNumber !== undefined) setTicketNumber(partial.ticketNumber);
    if (partial.externalGmudRef !== undefined) {
      setExternalGmudRef(partial.externalGmudRef);
    }
    if (partial.groupBy !== undefined) setGroupBy(partial.groupBy);
    if (partial.visibleColumns?.length) {
      setVisibleColumns(partial.visibleColumns);
    }
    if (partial.columnFilters) setColumnFilters(partial.columnFilters);
    if (partial.sortKey !== undefined) setSortKey(partial.sortKey);
    if (partial.sortDir !== undefined) setSortDir(partial.sortDir);
    setActivePresetId(preset.id);
  }

  const activeColumns = useMemo(
    () => TICKET_COLUMNS.filter((col) => visibleColumns.includes(col.key)),
    [visibleColumns],
  );

  const stageOptions = useMemo(() => {
    const fromApi = catalogs?.stages ?? [];
    const merged = [
      ...PORTAL_STAGES_ORDER,
      ...fromApi.filter((s) => !PORTAL_STAGES_ORDER.includes(s as (typeof PORTAL_STAGES_ORDER)[number])),
    ];
    return [
      { value: "", label: "Todos os estágios" },
      ...merged.map((s) => ({ value: s, label: s })),
    ];
  }, [catalogs]);

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

  const responsibleSelectOptions = useMemo(
    () => mapFilterResponsibles(catalogs?.responsibles ?? []),
    [catalogs],
  );

  const myResponsibleId = useMemo(
    () => currentUserResponsibleId(responsibleSelectOptions, user?.email),
    [responsibleSelectOptions, user?.email],
  );

  function applyResponsibleUpdate(
    ticketNumber: number,
    next: { responsibleId: number | null; responsibleName: string | null },
  ) {
    setData((prev) => {
      if (!prev) return prev;
      const shouldDrop =
        mineOnly &&
        myResponsibleId != null &&
        next.responsibleId !== myResponsibleId;
      const patchTicket = (ticket: TicketListItem): TicketListItem | null => {
        if (ticket.ticketNumber !== ticketNumber) return ticket;
        if (shouldDrop) return null;
        return {
          ...ticket,
          responsibleExternalId: next.responsibleId,
          responsibleName: next.responsibleName,
        };
      };
      const groups = prev.groups
        .map((group) => ({
          ...group,
          tickets: group.tickets
            .map(patchTicket)
            .filter((ticket): ticket is TicketListItem => ticket != null),
        }))
        .filter((group) => group.tickets.length > 0);
      const removed = shouldDrop ? 1 : 0;
      return {
        ...prev,
        total: Math.max(0, prev.total - removed),
        groups,
      };
    });
  }

  const deskOptions = useMemo(
    () => [
      { value: "", label: "Todos os catálogos" },
      ...(catalogs?.desks ?? []).map((d) => ({ value: d, label: d })),
    ],
    [catalogs],
  );

  const allTickets = useMemo(
    () => (data?.groups ?? []).flatMap((group) => group.tickets),
    [data],
  );

  const distinctByColumn = useMemo(() => {
    const map = {} as Record<TicketColumnKey, string[]>;
    for (const col of TICKET_COLUMNS) {
      const set = new Set<string>();
      for (const ticket of allTickets) {
        set.add(cellText(ticket, col.key));
      }
      map[col.key] = [...set].sort((a, b) =>
        a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true }),
      );
    }
    return map;
  }, [allTickets]);

  const displayTickets = useMemo(() => {
    let tickets = allTickets.filter((ticket) =>
      TICKET_COLUMNS.every((col) =>
        valuePassesExcelFilter(cellText(ticket, col.key), columnFilters[col.key]),
      ),
    );
    if (sortKey && sortDir) {
      tickets = [...tickets].sort((a, b) =>
        compareTickets(a, b, sortKey, sortDir),
      );
    }
    return tickets;
  }, [allTickets, columnFilters, sortKey, sortDir]);

  const activeTableFiltersCount = useMemo(
    () => countActiveExcelFilters(columnFilters),
    [columnFilters],
  );

  const activeFilterLabels = useMemo(() => {
    return TICKET_COLUMNS.filter((col) =>
      excelFilterActive(columnFilters[col.key]),
    ).map((col) => col.label);
  }, [columnFilters]);

  const filteredTotal = useMemo(
    () => displayTickets.length,
    [displayTickets],
  );

  const displaySections = useMemo(() => {
    if (groupBy === "none") {
      return [{ key: "all", label: "", tickets: displayTickets }];
    }
    const map = new Map<string, TicketListItem[]>();
    for (const ticket of displayTickets) {
      const label =
        groupBy === "stage"
          ? ticket.stageName ?? "—"
          : groupBy === "client"
            ? ticket.clientName ?? "—"
            : ticket.responsibleName ?? "Sem responsável";
      const bucket = map.get(label) ?? [];
      bucket.push(ticket);
      map.set(label, bucket);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
      .map(([label, tickets]) => ({
        key: label,
        label,
        tickets,
      }));
  }, [displayTickets, groupBy]);

  function renderTicketCell(ticket: TicketListItem, key: TicketColumnKey) {
    switch (key) {
      case "number":
        return (
          <td className="border-r border-border/30 px-3 py-2.5 text-right font-semibold tabular-nums text-primary">
            #{ticket.ticketNumber}
          </td>
        );
      case "title":
        return (
          <td className="max-w-[320px] border-r border-border/30 px-3 py-2.5">
            <span
              className="line-clamp-2 font-medium text-foreground"
              title={ticket.title ?? undefined}
            >
              {ticket.title ?? "—"}
            </span>
          </td>
        );
      case "client":
        return (
          <td className="border-r border-border/30 px-3 py-2.5">
            {ticket.clientName ?? "—"}
          </td>
        );
      case "gmud":
        return (
          <td className="border-r border-border/30 px-3 py-2.5 text-muted-foreground">
            {ticket.externalGmudRef ?? "—"}
          </td>
        );
      case "stage":
        return (
          <td className="border-r border-border/30 px-3 py-2.5">
            <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-xs font-medium">
              {ticket.stageName ?? "—"}
            </span>
          </td>
        );
      case "responsible":
        return (
          <td
            className="border-r border-border/30 px-3 py-2.5"
            onClick={(event) => event.stopPropagation()}
          >
            {canReassign ? (
              <TicketResponsibleSelect
                ticketNumber={ticket.ticketNumber}
                responsibleId={ticket.responsibleExternalId}
                responsibleName={ticket.responsibleName}
                options={responsibleSelectOptions}
                compact
                disabled={isDoneStage(ticket.stageName)}
                onUpdated={(next) => {
                  applyResponsibleUpdate(ticket.ticketNumber, next);
                  if (mineOnly) void load(true);
                }}
              />
            ) : (
              ticket.responsibleName ?? "—"
            )}
          </td>
        );
      case "updated":
        return (
          <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-muted-foreground">
            {formatWhen(ticket.updatedAt)}
          </td>
        );
      default:
        return null;
    }
  }

  function handleSort(columnKey: string) {
    const key = columnKey as TicketColumnKey;
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    if (sortDir === "asc") {
      setSortDir("desc");
      return;
    }
    setSortKey(null);
    setSortDir(null);
  }

  return (
    <ProtectedPage>
      <PermissionGate module="TICKETS">
        <AppShell>
          <div className="font-sans w-full space-y-6">
            <PageHeader
              icon={<Ticket size={24} />}
              title="Tickets"
              description={
                isClientMember()
                  ? "Tickets em que você é solicitante, criador ou está em cópia."
                  : isClientGestor()
                    ? TICKETS_CLIENT_LIST_SUBTITLE
                    : canCreateTicket()
                      ? TICKETS_LIST_SUBTITLE
                      : TICKETS_CREATE_ADMIN_ONLY_MESSAGE
              }
              actions={
                <>
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
                    {isClientMember()
                      ? "Meus tickets"
                      : isClientGestor()
                        ? "Tickets da empresa"
                        : mineOnly
                          ? "Meus tickets"
                          : "Todos os tickets abertos"}
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
                <div className="flex flex-wrap items-center gap-2">
                  <TicketListPresetsToolbar
                    presets={presets}
                    activePresetId={activePresetId}
                    onRefresh={() => void loadPresets()}
                    onApply={applyPreset}
                    onCreate={() => {
                      setEditingPreset(null);
                      setPresetDialogOpen(true);
                    }}
                    onEdit={(preset) => {
                      setEditingPreset(preset);
                      setPresetDialogOpen(true);
                    }}
                  />
                  {activeTableFiltersCount > 0 || sortKey ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setColumnFilters(emptyColumnFilters());
                        setSortKey(null);
                        setSortDir(null);
                      }}
                    >
                      Limpar tabela
                      {activeTableFiltersCount > 0
                        ? ` (${activeTableFiltersCount} filtro${activeTableFiltersCount > 1 ? "s" : ""})`
                        : ""}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAdvanced((v) => !v)}
                  >
                    <Filter className="mr-2 size-4" />
                    Busca avançada
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar por número ou título"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <FlipCheckbox
                    checked={includeDone}
                    onChange={(e) => setIncludeDone(e.target.checked)}
                  />
                  Incluir resolvidos, encerrados e cancelados
                </label>

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
                        Incluir tickets de outros responsáveis
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
                          allowClear
                          placeholder="Qualquer data"
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
                          allowClear
                          placeholder="Qualquer data"
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
                          onChange={(next) => {
                            setStageName(next);
                            if (
                              next === "Resolvido" ||
                              next === "Encerrado" ||
                              next === "Cancelado"
                            ) {
                              setIncludeDone(true);
                            }
                          }}
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
                          Catálogo
                        </Label>
                        <SearchableSelectField
                          value={deskName}
                          onChange={setDeskName}
                          options={deskOptions}
                          emptyLabel="Todos os catálogos"
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
                  {includeDone
                    ? "Nenhum ticket encontrado com os filtros atuais."
                    : "Nenhum ticket pendente encontrado. Marque “Incluir resolvidos, encerrados e cancelados” para ver o histórico."}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                  <span>
                    {filteredTotal} ticket(s)
                    {filteredTotal !== data.total ? ` de ${data.total}` : ""}
                    {includeDone
                      ? " · incluindo resolvidos/encerrados"
                      : " · só pendentes"}
                  </span>
                  {sortKey && sortDir ? (
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Ordenado por{" "}
                      {TICKET_COLUMNS.find((c) => c.key === sortKey)?.label ??
                        sortKey}{" "}
                      ({sortDir === "asc" ? "A → Z" : "Z → A"})
                    </span>
                  ) : null}
                  {activeFilterLabels.length > 0 ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      {activeFilterLabels.map((label) => (
                        <span
                          key={label}
                          className="rounded-md border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-xs font-medium text-teal-800 dark:text-teal-200"
                        >
                          {label}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </div>

                <Card className="gap-0 overflow-hidden py-0">
                  <CardContent className="p-0">
                    <div className="relative isolate max-h-[min(72vh,780px)] overflow-auto">
                      <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                        <thead className="sticky top-0 z-30 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
                          <tr>
                            {activeColumns.map((col) => (
                              <ExcelColumnHeader
                                key={col.key}
                                label={col.label}
                                columnKey={col.key}
                                sortKey={sortKey}
                                sortDir={sortDir}
                                onSort={handleSort}
                                filter={columnFilters[col.key]}
                                onFilterChange={(next) =>
                                  setColumnFilters((prev) => ({
                                    ...prev,
                                    [col.key]: next,
                                  }))
                                }
                                distinctValues={distinctByColumn[col.key]}
                                align={
                                  col.key === "number" ? "right" : "left"
                                }
                              />
                            ))}
                          </tr>
                        </thead>
                        <tbody className="relative z-0">
                          {filteredTotal === 0 ? (
                            <tr>
                              <td
                                colSpan={activeColumns.length}
                                className="px-3 py-12 text-center text-muted-foreground"
                              >
                                Nenhum ticket corresponde aos filtros da tabela.
                                {activeTableFiltersCount > 0
                                  ? " Use “Limpar tabela”."
                                  : ""}
                              </td>
                            </tr>
                          ) : (
                            displaySections.map((section) => (
                              <Fragment key={section.key}>
                                {section.label ? (
                                  <tr className="bg-muted/20">
                                    <td
                                      colSpan={activeColumns.length}
                                      className="sticky top-10 z-20 border-b border-border/60 bg-background px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                    >
                                      {section.label}{" "}
                                      <span className="font-normal">
                                        ({section.tickets.length})
                                      </span>
                                    </td>
                                  </tr>
                                ) : null}
                                {section.tickets.map((ticket, index) => (
                                  <tr
                                    key={ticket.ticketNumber}
                                    className={cn(
                                      "relative z-0 cursor-pointer border-b border-border/40 transition hover:bg-muted/30",
                                      index % 2 === 1 && "bg-muted/10",
                                    )}
                                    onClick={() =>
                                      router.push(
                                        `/tickets/${ticket.ticketNumber}`,
                                      )
                                    }
                                  >
                                    {activeColumns.map((col) => (
                                      <span key={col.key} className="contents">
                                        {renderTicketCell(ticket, col.key)}
                                      </span>
                                    ))}
                                  </tr>
                                ))}
                              </Fragment>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          <TicketListPresetDialog
            open={presetDialogOpen}
            onOpenChange={setPresetDialogOpen}
            pageState={pageState}
            catalogs={catalogs}
            editing={editingPreset}
            onSaved={() => void loadPresets()}
          />
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}
