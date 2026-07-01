import { apiRequest } from "@/lib/api";

export type ConsoleAlert = {
  eventId: string;
  objectId: string;
  name: string;
  severity: number;
  clock: number;
  acknowledged: boolean;
  durationSeconds: number;
  hostId: string | null;
  hostName: string | null;
  tags: Array<{ tag: string; value: string }>;
  groupName: string;
  companyName?: string | null;
  isPriorityCompany?: boolean;
};

export type ConsoleAlertsResponse = {
  group: string;
  alerts: ConsoleAlert[];
  priorityAlerts: ConsoleAlert[];
  fetchedAt: string;
  warnings?: string[];
  groupNotFound?: boolean;
};

export type ConsoleGroupOption = {
  name: string;
  groupid?: string;
  companyName?: string | null;
  isPriority?: boolean;
};

export type ConsoleGroupsResponse = {
  groups: ConsoleGroupOption[];
};

export type ConsoleHostSummary = {
  hostid: string;
  host: string;
  name: string;
  status: "enabled" | "disabled";
  maintenance: boolean;
  groups: string[];
  primaryIp: string | null;
};

export type ConsoleHostsResponse = {
  group: string;
  hosts: ConsoleHostSummary[];
  fetchedAt: string;
};

export type ConsoleAlertsQuery = {
  group?: string;
  severity?: string;
  ack?: "yes" | "no" | "all";
  search?: string;
  limit?: number;
  priorityOnly?: boolean;
};

function buildQuery(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function getConsoleGroups() {
  return apiRequest<ConsoleGroupsResponse>("/console/groups");
}

export function getConsoleAlerts(query: ConsoleAlertsQuery = {}) {
  return apiRequest<ConsoleAlertsResponse>(
    `/console/alerts${buildQuery({
      group: query.group,
      severity: query.severity,
      ack: query.ack,
      search: query.search,
      limit: query.limit,
      priorityOnly: query.priorityOnly ? "true" : undefined,
    })}`,
  );
}

export function getConsoleHosts(query: {
  group?: string;
  status?: "all" | "enabled" | "disabled";
  search?: string;
} = {}) {
  return apiRequest<ConsoleHostsResponse>(
    `/console/hosts${buildQuery({
      group: query.group,
      status: query.status,
      search: query.search,
    })}`,
  );
}

export function acknowledgeConsoleAlert(
  eventId: string,
  payload: { message?: string; group?: string } = {},
) {
  return apiRequest<{ ok: boolean; eventId: string }>(
    `/console/alerts/${encodeURIComponent(eventId)}/ack`,
    { method: "POST", body: payload },
  );
}

export function formatConsoleClock(clock: number) {
  if (!Number.isFinite(clock) || clock <= 0) return "—";
  return new Date(clock * 1000).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatConsoleDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

export function getConsoleSeverityLabel(severity: number) {
  switch (severity) {
    case 0:
      return "Não classificado";
    case 1:
      return "Informação";
    case 2:
      return "Atenção";
    case 3:
      return "Média";
    case 4:
      return "Alta";
    case 5:
      return "Desastre";
    default:
      return "—";
  }
}

export function getConsoleSeverityClass(severity: number) {
  switch (severity) {
    case 5:
    case 4:
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case 3:
      return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    case 2:
      return "bg-yellow-500/15 text-yellow-500 border-yellow-500/30";
    case 1:
      return "bg-sky-500/15 text-sky-400 border-sky-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
