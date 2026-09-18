"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Columns3, Filter, RefreshCw, Search, Ticket } from "lucide-react";

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
  canAccessPreTickets,
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
  TICKET_LIST_STATE_ENDPOINT,
  ticketsService,
  type TicketFilterCatalogs,
  type TicketListItem,
  type TicketListResponse,
  type TicketsListParams,
} from "@/lib/services/tickets.service";
import { ticketListPresetsService } from "@/lib/services/ticket-list-presets.service";
import {
  TICKET_LIST_COLUMNS,
  TICKET_LIST_GROUP_BY_LABELS,
  applyPresetConfigToPageState,
  type TicketColumnKey,
  type TicketListGroupBy,
  type TicketListPageState,
  type TicketListPreset,
} from "@/lib/tickets/list-presets";
import {
  TICKET_COLUMN_MAX_WIDTH,
  TICKET_COLUMN_MIN_WIDTH,
  useTicketTableLayout,
} from "@/lib/tickets/table-layout";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { buildApiUrl } from "@/lib/env";
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
    case "created":
      return formatWhen(ticket.createdAt);
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
  if (key === "updated" || key === "created") {
    const field = key === "updated" ? "updatedAt" : "createdAt";
    const ta = a[field] ? new Date(a[field]).getTime() : 0;
    const tb = b[field] ? new Date(b[field]).getTime() : 0;
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
    created: emptyExcelFilter(),
    updated: emptyExcelFilter(),
  };
}

function TicketsPageImpl() {
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
  const [withoutResponsible, setWithoutResponsible] = useState(false);
  const [columnFilters, setColumnFilters] = useState(emptyColumnFilters);
  const [sortKey, setSortKey] = useState<TicketColumnKey | null>(null);
  const [sortDir, setSortDir] = useState<ExcelSortDir | null>(null);
  // Agrupado por estágio por padrão: é o que deixa o acordeon (recolher por
  // grupo) visível sem precisar aplicar um preset primeiro.
  const [groupBy, setGroupBy] = useState<TicketListGroupBy>("stage");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  // Colunas visíveis e larguras (salvas junto com o estado da tela).
  const {
    visibleColumns,
    setVisibleColumns,
    widths: columnWidths,
    widthOf,
    setColumnWidth,
    resetLayout,
    restoreLayout,
  } = useTicketTableLayout();
  // Estado da tela salvo no usuário: a lista só carrega depois de restaurar,
  // para não buscar com os filtros padrão e logo em seguida com os salvos.
  const [listStateReady, setListStateReady] = useState(false);
  const [presets, setPresets] = useState<TicketListPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<TicketListPreset | null>(
    null,
  );

  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const mineOnly = !includeAllResponsibles;
  const [search, setSearch] = useState("");
  // A busca vai ao servidor; sem debounce cada tecla dispara uma requisição de
  // até 500 tickets.
  const [debouncedSearch, setDebouncedSearch] = useState("");
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
      search: debouncedSearch.trim() || undefined,
      externalGmudRef: externalGmudRef.trim() || undefined,
      includeDone: includeDone || undefined,
      withoutResponsible: withoutResponsible || undefined,
    };
  }, [
    withoutResponsible,
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
    debouncedSearch,
    includeDone,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Catálogos são carregados uma vez; manter `catalogs` fora das dependências
  // de `load` evita que o próprio setCatalogs redispare o efeito e busque a
  // lista duas vezes a cada montagem.
  const catalogsLoadedRef = useRef(false);
  const loadSeqRef = useRef(0);

  const load = useCallback(async (isRefresh = false) => {
    const seq = ++loadSeqRef.current;
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const [list, cats] = await Promise.all([
        ticketsService.list(queryParams),
        catalogsLoadedRef.current
          ? Promise.resolve(null)
          : ticketsService.catalogs(),
      ]);
      // Resposta obsoleta (o usuário já digitou de novo): descarta.
      if (seq !== loadSeqRef.current) return;
      setData(list);
      setLoadError(null);
      if (cats) {
        catalogsLoadedRef.current = true;
        setCatalogs(cats);
      }
      refreshPreTicketsBadge();
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      const message =
        err instanceof Error ? err.message : "Não foi possível carregar os tickets.";
      setLoadError(message);
      notifyError(message);
    } finally {
      if (seq !== loadSeqRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [queryParams]);

  useEffect(() => {
    if (!listStateReady) return;
    void load();
  }, [load, listStateReady]);

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
      withoutResponsible,
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
      withoutResponsible,
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

  // ---- Estado da tela salvo no usuário ----
  const savedStateJsonRef = useRef<string | null>(null);
  const pendingStateJsonRef = useRef<string | null>(null);

  const persistableState = useMemo(
    () => ({
      version: 1,
      ...pageState,
      columnWidths,
      activePresetId,
      collapsedGroups: [...collapsedGroups],
      showAdvanced,
    }),
    [pageState, columnWidths, activePresetId, collapsedGroups, showAdvanced],
  );

  // Restaura uma vez ao abrir a tela.
  useEffect(() => {
    let cancelled = false;
    void ticketsService
      .getListState()
      .then(({ state }) => {
        if (cancelled || !state || state.version !== 1) return;
        const str = (v: unknown) => (typeof v === "string" ? v : "");
        const bool = (v: unknown, fallback: boolean) =>
          typeof v === "boolean" ? v : fallback;
        setIncludeAllResponsibles(
          bool(state.includeAllResponsibles, isClientGestor()),
        );
        setIncludeDone(bool(state.includeDone, false));
        setWithoutResponsible(bool(state.withoutResponsible, false));
        setSearch(str(state.search));
        setDebouncedSearch(str(state.search));
        setFrom(str(state.from));
        setTo(str(state.to));
        setResponsibleExternalId(str(state.responsibleExternalId));
        setClientExternalId(str(state.clientExternalId));
        setStageName(str(state.stageName));
        setDeskName(str(state.deskName));
        setRequestorName(str(state.requestorName));
        setTicketNumber(str(state.ticketNumber));
        setExternalGmudRef(str(state.externalGmudRef));
        if (
          state.groupBy === "none" ||
          state.groupBy === "stage" ||
          state.groupBy === "client" ||
          state.groupBy === "responsible"
        ) {
          setGroupBy(state.groupBy);
        }
        restoreLayout({
          visibleColumns: state.visibleColumns,
          widths: state.columnWidths,
        });
        if (state.columnFilters && typeof state.columnFilters === "object") {
          setColumnFilters({
            ...emptyColumnFilters(),
            ...(state.columnFilters as Partial<
              Record<TicketColumnKey, ExcelColumnFilterState>
            >),
          });
        }
        const keys = TICKET_COLUMNS.map((c) => c.key as string);
        const sk = typeof state.sortKey === "string" ? state.sortKey : null;
        const sd =
          state.sortDir === "asc" || state.sortDir === "desc"
            ? state.sortDir
            : null;
        setSortKey(sk && keys.includes(sk) ? (sk as TicketColumnKey) : null);
        setSortDir(sk && keys.includes(sk) ? sd : null);
        setActivePresetId(
          typeof state.activePresetId === "string" ? state.activePresetId : null,
        );
        setCollapsedGroups(
          new Set(
            Array.isArray(state.collapsedGroups)
              ? state.collapsedGroups.filter(
                  (v): v is string => typeof v === "string",
                )
              : [],
          ),
        );
        setShowAdvanced(bool(state.showAdvanced, false));
      })
      .catch(() => {
        /* sem estado salvo: segue com o padrão */
      })
      .finally(() => {
        if (!cancelled) setListStateReady(true);
      });
    return () => {
      cancelled = true;
    };
    // Só na montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Grava a cada mudança (com um pequeno intervalo para não gravar a cada tecla).
  useEffect(() => {
    if (!listStateReady) return;
    const json = JSON.stringify(persistableState);
    if (savedStateJsonRef.current === null) {
      // Primeiro estado após restaurar: já é o que está salvo.
      savedStateJsonRef.current = json;
      return;
    }
    if (json === savedStateJsonRef.current) return;
    pendingStateJsonRef.current = json;
    const timer = window.setTimeout(() => {
      void ticketsService
        .saveListState(persistableState)
        .then(() => {
          savedStateJsonRef.current = json;
          if (pendingStateJsonRef.current === json) {
            pendingStateJsonRef.current = null;
          }
        })
        .catch(() => {
          /* tenta de novo na próxima mudança */
        });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [persistableState, listStateReady]);

  // Fechou a aba/saiu da tela antes de gravar: envia o que faltou.
  useEffect(() => {
    const flush = () => {
      const json = pendingStateJsonRef.current;
      if (!json || json === savedStateJsonRef.current) return;
      pendingStateJsonRef.current = null;
      try {
        void fetch(buildApiUrl(TICKET_LIST_STATE_ENDPOINT), {
          method: "PUT",
          keepalive: true,
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-Alleone-Api": "1",
          },
          body: `{"state":${json}}`,
        });
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  function clearListFilters() {
    setIncludeAllResponsibles(isClientGestor());
    setIncludeDone(false);
    setWithoutResponsible(false);
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
    setGroupBy("stage");
    setColumnFilters(emptyColumnFilters());
    setSortKey(null);
    setSortDir(null);
    setActivePresetId(null);
  }

  function applyPreset(
    preset: TicketListPreset,
    options: { toggle?: boolean } = {},
  ) {
    if (options.toggle && activePresetId === preset.id) {
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
    if (partial.withoutResponsible !== undefined) {
      setWithoutResponsible(partial.withoutResponsible);
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
  const tableWidth = activeColumns.reduce(
    (sum, col) => sum + widthOf(col.key),
    0,
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

  // `totalCount` é a contagem real no filtro; `total` é só o tamanho da página.
  const serverTotal = data?.totalCount ?? data?.total ?? 0;
  const loadedCount = allTickets.length;
  const hasMore = data?.hasMore ?? false;

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
    // Por estágio: ordem do fluxo (Novo primeiro); demais, alfabética.
    const stageRank = (label: string) => {
      const idx = PORTAL_STAGES_ORDER.findIndex(
        (stage) => stage.toLowerCase() === label.trim().toLowerCase(),
      );
      return idx === -1 ? PORTAL_STAGES_ORDER.length : idx;
    };
    return [...map.entries()]
      .sort(([a], [b]) =>
        groupBy === "stage"
          ? stageRank(a) - stageRank(b) || a.localeCompare(b, "pt-BR")
          : a.localeCompare(b, "pt-BR"),
      )
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
            <span className="inline-flex items-center justify-end gap-1.5">
              {ticket.hasPendingWarning ? (
                <span
                  className="size-2 shrink-0 rounded-full bg-amber-400"
                  title="Comunicação pendente de leitura"
                  aria-label="Comunicação pendente de leitura"
                />
              ) : null}
              #{ticket.ticketNumber}
            </span>
          </td>
        );
      case "title":
        return (
          <td className="border-r border-border/30 px-3 py-2.5">
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
      case "created":
        return (
          <td className="border-r border-border/30 px-3 py-2.5 text-xs text-muted-foreground">
            <div className="whitespace-nowrap tabular-nums">
              {formatWhen(ticket.createdAt)}
            </div>
            {ticket.createdByName ? (
              <div
                className="truncate text-[11px] text-muted-foreground/80"
                title={ticket.createdByName}
              >
                por {ticket.createdByName}
              </div>
            ) : null}
          </td>
        );
      case "updated":
        return (
          <td className="px-3 py-2.5 text-xs text-muted-foreground">
            <div className="whitespace-nowrap tabular-nums">
              {formatWhen(ticket.updatedAt)}
            </div>
            {ticket.updatedByName ? (
              <div
                className="truncate text-[11px] text-muted-foreground/80"
                title={ticket.updatedByName}
              >
                por {ticket.updatedByName}
              </div>
            ) : null}
          </td>
        );
      default:
        return null;
    }
  }

  async function loadMore() {
    if (!data || loadingMore || !data.hasMore) return;
    const seq = loadSeqRef.current;
    try {
      setLoadingMore(true);
      const next = await ticketsService.list({
        ...queryParams,
        offset: allTickets.length,
      });
      // Filtro mudou no meio do caminho: descarta para não misturar páginas.
      if (seq !== loadSeqRef.current) return;
      setData((prev) => {
        if (!prev) return next;
        const seen = new Set(
          prev.groups.flatMap((g) => g.tickets.map((t) => t.ticketNumber)),
        );
        const merged = [...prev.groups];
        for (const group of next.groups) {
          const novos = group.tickets.filter((t) => !seen.has(t.ticketNumber));
          if (novos.length === 0) continue;
          const existente = merged.find((g) => g.key === group.key);
          if (existente) {
            existente.tickets = [...existente.tickets, ...novos];
          } else {
            merged.push({ ...group, tickets: novos });
          }
        }
        return {
          ...next,
          groups: merged,
          total: prev.total + next.total,
        };
      });
    } catch (err) {
      notifyError(
        err instanceof Error ? err.message : "Não foi possível carregar mais.",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  function toggleGroupCollapsed(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setAllGroupsCollapsed(collapsed: boolean) {
    setCollapsedGroups(
      collapsed ? new Set(displaySections.map((s) => s.key)) : new Set(),
    );
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
                  {canAccessPreTickets() ? (
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
                          setActivePresetId(null);
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
                        onClick={() => {
                          setActivePresetId(null);
                          setIncludeAllResponsibles(true);
                        }}
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
                    onClear={clearListFilters}
                    onCreate={() => {
                      setEditingPreset(null);
                      setPresetDialogOpen(true);
                    }}
                    onEdit={(preset) => {
                      setEditingPreset(preset);
                      setPresetDialogOpen(true);
                    }}
                  />
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Agrupar por
                    </Label>
                    <SearchableSelectField
                      clearable={false}
                      value={groupBy}
                      onChange={(v) => setGroupBy(v as TicketListGroupBy)}
                      options={Object.entries(TICKET_LIST_GROUP_BY_LABELS).map(
                        ([value, label]) => ({ value, label }),
                      )}
                      preserveOrder
                      emptyLabel="Nenhum"
                      className="h-8 w-[150px]"
                    />
                  </div>
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

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                    <FlipCheckbox
                      checked={includeDone}
                      onChange={(e) => setIncludeDone(e.target.checked)}
                    />
                    Incluir resolvidos, encerrados e cancelados
                  </label>
                  {!isClient() ? (
                    <label
                      className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
                      title="Tickets de toda a fila sem responsável. Pré-tickets só aparecem se já tiverem apontamento."
                    >
                      <FlipCheckbox
                        checked={withoutResponsible}
                        onChange={(e) => setWithoutResponsible(e.target.checked)}
                      />
                      Somente sem responsável
                    </label>
                  ) : null}
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
                          Solicitante
                        </Label>
                        <Input
                          value={requestorName}
                          onChange={(e) => setRequestorName(e.target.value)}
                          placeholder="Nome ou e-mail do solicitante"
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
            ) : loadError ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                  <p className="text-sm font-medium text-foreground">
                    Não foi possível carregar os tickets.
                  </p>
                  <p className="max-w-md text-sm text-muted-foreground">
                    {loadError}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void load(true)}
                  >
                    <RefreshCw className="mr-2 size-4" />
                    Tentar de novo
                  </Button>
                </CardContent>
              </Card>
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
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                      >
                        <Columns3 className="size-4" />
                        Colunas
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-60 p-0 font-sans">
                      <div className="border-b border-border/60 px-3 py-2.5">
                        <p className="text-xs font-semibold text-foreground">
                          Colunas da tabela
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Arraste a borda do cabeçalho para mudar a largura.
                        </p>
                      </div>
                      <div className="space-y-0.5 p-1.5">
                        {TICKET_COLUMNS.map((col) => {
                          const checked = visibleColumns.includes(col.key);
                          const isLast = checked && visibleColumns.length === 1;
                          return (
                            <label
                              key={col.key}
                              className={cn(
                                "flex items-center gap-2 rounded px-2 py-1.5 text-xs text-foreground transition hover:bg-muted/50",
                                isLast ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                              )}
                              title={isLast ? "A tabela precisa de pelo menos uma coluna" : undefined}
                            >
                              <FlipCheckbox
                                checked={checked}
                                disabled={isLast}
                                onChange={(e) =>
                                  setVisibleColumns(
                                    e.target.checked
                                      ? [...visibleColumns, col.key]
                                      : visibleColumns.filter((k) => k !== col.key),
                                  )
                                }
                              />
                              {col.label}
                            </label>
                          );
                        })}
                      </div>
                      <div className="border-t border-border/60 px-3 py-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-full text-xs"
                          onClick={resetLayout}
                        >
                          Restaurar padrão
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <span>
                    {filteredTotal} ticket(s)
                    {filteredTotal !== serverTotal ? ` de ${serverTotal}` : ""}
                    {includeDone
                      ? " · incluindo resolvidos/encerrados"
                      : " · só pendentes"}
                  </span>
                  {hasMore ? (
                    <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                      {loadedCount} carregados · filtros de coluna valem só sobre
                      estes
                    </span>
                  ) : null}
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
                  {groupBy !== "none" && displaySections.length > 1 ? (
                    <span className="ml-auto flex items-center gap-1.5">
                      <button
                        type="button"
                        className="text-xs font-medium text-primary hover:underline"
                        onClick={() => setAllGroupsCollapsed(true)}
                      >
                        Recolher tudo
                      </button>
                      <span className="text-border">·</span>
                      <button
                        type="button"
                        className="text-xs font-medium text-primary hover:underline"
                        onClick={() => setAllGroupsCollapsed(false)}
                      >
                        Expandir tudo
                      </button>
                    </span>
                  ) : null}
                </div>

                <Card className="gap-0 overflow-hidden py-0">
                  <CardContent className="p-0">
                    <div className="relative isolate max-h-[min(72vh,780px)] overflow-auto">
                      <table
                        className="min-w-full table-fixed border-collapse text-left text-sm"
                        style={{ width: tableWidth }}
                      >
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
                                width={widthOf(col.key)}
                                minWidth={TICKET_COLUMN_MIN_WIDTH}
                                maxWidth={TICKET_COLUMN_MAX_WIDTH}
                                onResize={(w) => setColumnWidth(col.key, w)}
                              />
                            ))}
                          </tr>
                        </thead>
                        {filteredTotal === 0 ? (
                          <tbody className="relative z-0">
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
                          </tbody>
                          ) : (
                            displaySections.map((section) => {
                              const isCollapsed = collapsedGroups.has(
                                section.key,
                              );
                              return (
                              // Um tbody por grupo (agrupamento semântico da
                              // tabela). O cabeçalho de grupo NÃO é sticky: em
                              // célula de tabela o bloco de contenção do sticky
                              // é a tabela inteira, não o tbody, então vários
                              // cabeçalhos grudavam na mesma altura e ficavam
                              // escritos um por cima do outro. Só o thead
                              // (cabeçalho de colunas) fica fixo.
                              <tbody key={section.key} className="relative z-0">
                                {section.label ? (
                                  <tr className="bg-muted/30">
                                    <td
                                      colSpan={activeColumns.length}
                                      className="cursor-pointer select-none border-b-2 border-l-4 border-b-border/60 border-l-primary/60 bg-muted/30 px-3 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/50"
                                      onClick={() =>
                                        toggleGroupCollapsed(section.key)
                                      }
                                      title="Clique para recolher ou expandir este grupo"
                                    >
                                      <span className="inline-flex items-center gap-2">
                                        <span className="inline-flex size-5 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground">
                                          {isCollapsed ? (
                                            <ChevronRight className="size-3.5" />
                                          ) : (
                                            <ChevronDown className="size-3.5" />
                                          )}
                                        </span>
                                        <span className="uppercase tracking-wide">
                                          {section.label}
                                        </span>
                                        <span className="font-normal text-muted-foreground">
                                          ({section.tickets.length})
                                        </span>
                                        <span className="hidden font-normal normal-case text-muted-foreground/70 sm:inline">
                                          · clique para {isCollapsed ? "expandir" : "recolher"}
                                        </span>
                                      </span>
                                    </td>
                                  </tr>
                                ) : null}
                                {isCollapsed
                                  ? null
                                  : section.tickets.map((ticket, index) => (
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
                                      <Fragment key={col.key}>
                                        {renderTicketCell(ticket, col.key)}
                                      </Fragment>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                              );
                            })
                          )}
                      </table>
                    </div>
                    {hasMore ? (
                      <div className="flex items-center justify-center gap-3 border-t border-border/60 px-4 py-3">
                        <span className="text-xs text-muted-foreground">
                          {loadedCount} de {serverTotal}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={loadingMore}
                          onClick={() => void loadMore()}
                        >
                          {loadingMore ? (
                            <>
                              <RefreshCw className="mr-2 size-4 animate-spin" />
                              Carregando...
                            </>
                          ) : (
                            "Carregar mais"
                          )}
                        </Button>
                      </div>
                    ) : null}
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
            onSaved={(saved) => {
              void loadPresets();
              // Editou o filtro que está aplicado: a tela passa a refletir a versão nova.
              if (saved && saved.id === activePresetId) applyPreset(saved);
            }}
          />
        </AppShell>
      </PermissionGate>
    </ProtectedPage>
  );
}

export { TicketsPageImpl as PortalPageComponent };
