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
  | "TIFLUX_SYNC_STALE"
  // Tipos que o backend já grava e a tela não conhecia (ficavam escondidos
  // pelo filtro): Mural, Oportunidades, NPS, contrato e os de chamado.
  | "MURAL_NOTE_RECEIVED"
  | "OPORTUNIDADE_NOVA"
  | "OPORTUNIDADE_ESTAGIO"
  | "OPORTUNIDADE_ALERTA"
  | "OPORTUNIDADE_RETORNO"
  | "NPS_DETRATOR"
  | "CONTRATO_CONSUMO"
  | "TICKET_ABERTO_PARA_VOCE"
  | "TICKET_NOVO_RESPONSAVEL";

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
  MURAL_NOTE_RECEIVED: "Somos Alle",
  OPORTUNIDADE_NOVA: "Oportunidades",
  OPORTUNIDADE_ESTAGIO: "Oportunidades",
  OPORTUNIDADE_ALERTA: "Oportunidades",
  OPORTUNIDADE_RETORNO: "Oportunidades",
  NPS_DETRATOR: "NPS",
  CONTRATO_CONSUMO: "Contrato",
  TICKET_ABERTO_PARA_VOCE: "Ticket",
  TICKET_NOVO_RESPONSAVEL: "Ticket",
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
  {
    kind: "TICKET_ABERTO_PARA_VOCE",
    label: "Chamado aberto para você",
    description: "Alguém abriu um chamado em que você é o solicitante.",
  },
  {
    kind: "TICKET_NOVO_RESPONSAVEL",
    label: "Você virou responsável",
    description: "Alguém colocou você como responsável por um chamado.",
  },
  {
    kind: "MURAL_NOTE_RECEIVED",
    label: "Bilhete no Somos Alle",
    description: "Alguém deixou um recado para você.",
  },
  {
    kind: "OPORTUNIDADE_NOVA",
    label: "Oportunidade nova",
    description: "Card novo no quadro de Oportunidades.",
  },
  {
    kind: "OPORTUNIDADE_ESTAGIO",
    label: "Oportunidade mudou de etapa",
    description: "Uma oportunidade sua mudou de coluna.",
  },
  {
    kind: "OPORTUNIDADE_ALERTA",
    label: "Oportunidade parada",
    description: "Card parado ou sem movimentação há muito tempo.",
  },
  {
    kind: "OPORTUNIDADE_RETORNO",
    label: "Oportunidade aguardando o cliente",
    description: "Card aguardando o cliente desde a data combinada.",
  },
  {
    kind: "NPS_DETRATOR",
    label: "NPS: nota baixa",
    description: "Cliente deu nota de detrator na pesquisa.",
  },
  {
    kind: "CONTRATO_CONSUMO",
    label: "Contrato: consumo de horas",
    description: "Aviso de consumo das horas contratadas.",
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
