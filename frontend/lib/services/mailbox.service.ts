import { apiRequest } from "@/lib/api";
import {
  MAILBOX_RENDIMENTO_ALERT_FILTER_DESC,
  MAILBOX_RENDIMENTO_APPROVAL_FILTER_DESC,
} from "@/lib/module-copy";

export type MailboxNotificationKind =
  | "RENDIMENTO_ALERT"
  | "RENDIMENTO_APPROVAL_PENDING"
  | "CONTRACT_USAGE"
  | "GMUD_PENDING_APPROVAL"
  | "TICKET_NO_APPOINTMENT_24H"
  | "TICKET_STALLED_48H"
  | "TICKET_STALLED_7D"
  | "INVENTORY_EXPIRY"
  | "TIFLUX_SYNC_STALE";

export type MailboxNotification = {
  id: string;
  userId: string;
  kind: MailboxNotificationKind;
  title: string;
  body: string;
  href: string | null;
  payload: Record<string, unknown> | null;
  dedupeKey: string;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const KIND_LABELS: Record<MailboxNotificationKind, string> = {
  RENDIMENTO_ALERT: "Rendimento",
  RENDIMENTO_APPROVAL_PENDING: "Rendimento",
  CONTRACT_USAGE: "Contrato",
  GMUD_PENDING_APPROVAL: "GMUD",
  TICKET_NO_APPOINTMENT_24H: "Ticket",
  TICKET_STALLED_48H: "Ticket",
  TICKET_STALLED_7D: "Ticket",
  INVENTORY_EXPIRY: "Inventário",
  TIFLUX_SYNC_STALE: "Integrações",
};

export const MAILBOX_KIND_OPTIONS: {
  kind: MailboxNotificationKind;
  label: string;
  description: string;
}[] = [
  {
    kind: "RENDIMENTO_ALERT",
    label: "Intervalos na agenda",
    description: MAILBOX_RENDIMENTO_ALERT_FILTER_DESC,
  },
  {
    kind: "RENDIMENTO_APPROVAL_PENDING",
    label: "Justificativas na agenda",
    description: MAILBOX_RENDIMENTO_APPROVAL_FILTER_DESC,
  },
  {
    kind: "CONTRACT_USAGE",
    label: "Contratos (consumo de horas)",
    description: "Uso abaixo de 30% ou acima de 70% das horas contratadas.",
  },
  {
    kind: "GMUD_PENDING_APPROVAL",
    label: "GMUD para aprovar",
    description: "Mudanças aguardando sua decisão.",
  },
  {
    kind: "TICKET_NO_APPOINTMENT_24H",
    label: "Ticket sem registro de horas (24h+)",
    description: "Ticket seu, aberto há mais de 24h sem registro de horas.",
  },
  {
    kind: "TICKET_STALLED_48H",
    label: "Ticket parado (48h+)",
    description: "Ticket aberto sem atualização há mais de 48 horas.",
  },
  {
    kind: "TICKET_STALLED_7D",
    label: "Ticket parado (7 dias+)",
    description: "Ticket aberto sem atualização há mais de 7 dias.",
  },
  {
    kind: "INVENTORY_EXPIRY",
    label: "Inventário (vencimento)",
    description: "Ativos vencidos ou com vencimento nos próximos 30 dias.",
  },
];

export const ALL_MAILBOX_KINDS = MAILBOX_KIND_OPTIONS.map((o) => o.kind);

export function mailboxKindLabel(kind: MailboxNotificationKind): string {
  return KIND_LABELS[kind] ?? "Aviso";
}

export function mailboxKindFilterLabel(kind: MailboxNotificationKind): string {
  return (
    MAILBOX_KIND_OPTIONS.find((o) => o.kind === kind)?.label ??
    mailboxKindLabel(kind)
  );
}

export const mailboxService = {
  list() {
    return apiRequest<MailboxNotification[]>("/mailbox");
  },

  unreadCount() {
    return apiRequest<{ count: number }>("/mailbox/unread-count");
  },

  refresh() {
    return apiRequest<{ ok: boolean }>("/mailbox/refresh", { method: "POST" });
  },

  markRead(id: string) {
    return apiRequest<MailboxNotification>(`/mailbox/${id}/read`, {
      method: "PATCH",
    });
  },

  markAllRead() {
    return apiRequest<{ ok: boolean }>("/mailbox/read-all", {
      method: "PATCH",
    });
  },
};
