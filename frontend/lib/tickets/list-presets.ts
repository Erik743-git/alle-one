import type { ExcelColumnFilterState, ExcelSortDir } from "@/components/tickets/excel-column-header";
import type { TicketsListParams } from "@/lib/services/tickets.service";

export type TicketColumnKey =
  | "number"
  | "title"
  | "client"
  | "gmud"
  | "origin"
  | "priority"
  | "stage"
  | "responsible"
  | "updated";

export const TICKET_LIST_COLUMNS: Array<{ key: TicketColumnKey; label: string }> =
  [
    { key: "number", label: "Número" },
    { key: "title", label: "Título" },
    { key: "client", label: "Cliente" },
    { key: "gmud", label: "GMUD" },
    { key: "origin", label: "Origem" },
    { key: "priority", label: "Prioridade" },
    { key: "stage", label: "Estágio" },
    { key: "responsible", label: "Responsável" },
    { key: "updated", label: "Atualizado" },
  ];

export const TICKET_LIST_PRESET_COLORS = [
  "#f97316",
  "#14b8a6",
  "#38bdf8",
  "#0d9488",
  "#0891b2",
  "#ea580c",
  "#fdba74",
  "#22c55e",
  "#ef4444",
] as const;

export type TicketListGroupBy = "none" | "stage" | "client" | "responsible";

export type TicketListFilterField =
  | "mineOnly"
  | "includeDone"
  | "search"
  | "ticketNumber"
  | "externalGmudRef"
  | "stageName"
  | "clientExternalId"
  | "responsibleExternalId"
  | "deskName"
  | "from"
  | "to"
  | "unassigned";

export const TICKET_LIST_FILTER_FIELD_LABELS: Record<
  TicketListFilterField,
  string
> = {
  mineOnly: "Meus tickets",
  includeDone: "Incluir concluídos",
  search: "Busca (título/número)",
  ticketNumber: "Número",
  externalGmudRef: "GMUD",
  stageName: "Estágio",
  clientExternalId: "Cliente",
  responsibleExternalId: "Responsável",
  deskName: "Catálogo",
  from: "Criado a partir de",
  to: "Criado até",
  unassigned: "Sem responsável",
};

export const TICKET_LIST_GROUP_BY_LABELS: Record<TicketListGroupBy, string> = {
  none: "Nenhum",
  stage: "Estágio",
  client: "Cliente",
  responsible: "Responsável",
};

export type TicketListPresetFilterRule = {
  field: TicketListFilterField;
  value: string;
};

export type TicketListPresetConfig = {
  rules?: TicketListPresetFilterRule[];
  groupBy?: TicketListGroupBy;
  visibleColumns?: TicketColumnKey[];
  columnFilters?: Record<TicketColumnKey, ExcelColumnFilterState>;
  sortKey?: TicketColumnKey | null;
  sortDir?: ExcelSortDir | null;
};

export type TicketListPreset = {
  id: string;
  name: string;
  color: string;
  isPublic: boolean;
  isPinned: boolean;
  sortOrder: number;
  config: TicketListPresetConfig;
  isOwner: boolean;
  ownerName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TicketListPageState = {
  includeAllResponsibles: boolean;
  includeDone: boolean;
  search: string;
  from: string;
  to: string;
  responsibleExternalId: string;
  clientExternalId: string;
  stageName: string;
  deskName: string;
  ticketNumber: string;
  externalGmudRef: string;
  groupBy: TicketListGroupBy;
  visibleColumns: TicketColumnKey[];
  columnFilters: Record<TicketColumnKey, ExcelColumnFilterState>;
  sortKey: TicketColumnKey | null;
  sortDir: ExcelSortDir | null;
};

export function buildPresetConfigFromPageState(
  state: TicketListPageState,
): TicketListPresetConfig {
  const rules: TicketListPresetFilterRule[] = [];

  if (!state.includeAllResponsibles) {
    rules.push({ field: "mineOnly", value: "true" });
  }
  if (state.includeDone) {
    rules.push({ field: "includeDone", value: "true" });
  }
  if (state.search.trim()) {
    rules.push({ field: "search", value: state.search.trim() });
  }
  if (state.ticketNumber.trim()) {
    rules.push({ field: "ticketNumber", value: state.ticketNumber.trim() });
  }
  if (state.externalGmudRef.trim()) {
    rules.push({
      field: "externalGmudRef",
      value: state.externalGmudRef.trim(),
    });
  }
  if (state.stageName) {
    rules.push({ field: "stageName", value: state.stageName });
  }
  if (state.clientExternalId) {
    rules.push({ field: "clientExternalId", value: state.clientExternalId });
  }
  if (state.responsibleExternalId) {
    rules.push({
      field: "responsibleExternalId",
      value: state.responsibleExternalId,
    });
  }
  if (state.deskName) {
    rules.push({ field: "deskName", value: state.deskName });
  }
  if (state.from) {
    rules.push({ field: "from", value: state.from });
  }
  if (state.to) {
    rules.push({ field: "to", value: state.to });
  }

  return {
    rules,
    groupBy: state.groupBy,
    visibleColumns: state.visibleColumns,
    columnFilters: state.columnFilters,
    sortKey: state.sortKey,
    sortDir: state.sortDir,
  };
}

export function applyPresetConfigToPageState(
  config: TicketListPresetConfig,
): Partial<TicketListPageState> {
  const next: Partial<TicketListPageState> = {
    includeAllResponsibles: true,
    includeDone: false,
    search: "",
    from: "",
    to: "",
    responsibleExternalId: "",
    clientExternalId: "",
    stageName: "",
    deskName: "",
    ticketNumber: "",
    externalGmudRef: "",
    groupBy: config.groupBy ?? "none",
    visibleColumns:
      config.visibleColumns?.length === 0
        ? undefined
        : (config.visibleColumns as TicketColumnKey[] | undefined),
    columnFilters: config.columnFilters as
      | Record<TicketColumnKey, ExcelColumnFilterState>
      | undefined,
    sortKey: (config.sortKey as TicketColumnKey | null | undefined) ?? null,
    sortDir: config.sortDir ?? null,
  };

  for (const rule of config.rules ?? []) {
    switch (rule.field) {
      case "mineOnly":
        if (rule.value === "true") next.includeAllResponsibles = false;
        break;
      case "includeDone":
        if (rule.value === "true") next.includeDone = true;
        break;
      case "search":
        next.search = rule.value;
        break;
      case "ticketNumber":
        next.ticketNumber = rule.value;
        break;
      case "externalGmudRef":
        next.externalGmudRef = rule.value;
        break;
      case "stageName":
        next.stageName = rule.value;
        break;
      case "clientExternalId":
        next.clientExternalId = rule.value;
        break;
      case "responsibleExternalId":
        next.responsibleExternalId = rule.value;
        break;
      case "deskName":
        next.deskName = rule.value;
        break;
      case "from":
        next.from = rule.value;
        break;
      case "to":
        next.to = rule.value;
        break;
      case "unassigned":
        break;
      default:
        break;
    }
  }

  return next;
}

export function presetConfigToQueryParams(
  config: TicketListPresetConfig,
): TicketsListParams {
  const params: TicketsListParams = {};
  for (const rule of config.rules ?? []) {
    switch (rule.field) {
      case "mineOnly":
        if (rule.value === "true") params.mineOnly = true;
        break;
      case "includeDone":
        if (rule.value === "true") params.includeDone = true;
        break;
      case "search":
        params.search = rule.value;
        break;
      case "ticketNumber": {
        const n = Number(rule.value);
        if (Number.isFinite(n)) params.ticketNumber = n;
        break;
      }
      case "externalGmudRef":
        params.externalGmudRef = rule.value;
        break;
      case "stageName":
        params.stageName = rule.value;
        break;
      case "clientExternalId": {
        const n = Number(rule.value);
        if (Number.isFinite(n)) params.clientExternalId = n;
        break;
      }
      case "responsibleExternalId": {
        const n = Number(rule.value);
        if (Number.isFinite(n)) params.responsibleExternalId = n;
        break;
      }
      case "deskName":
        params.deskName = rule.value;
        break;
      case "from":
        params.from = rule.value;
        break;
      case "to":
        params.to = rule.value;
        break;
      default:
        break;
    }
  }
  if (!params.mineOnly && config.rules?.some((r) => r.field === "mineOnly")) {
    params.mineOnly = false;
  }
  return params;
}
