import {
  ALL_MAILBOX_KINDS,
  type MailboxNotificationKind,
} from "@/lib/services/mailbox.service";

/**
 * Filtro de tipos do Correio.
 *
 * Guarda o que a pessoa ESCONDEU, e não o que ela quer ver. Antes guardava
 * "os que mostrar": todo tipo que entrasse depois (Mural, Oportunidades, NPS,
 * contrato, chamado aberto para você…) ficava escondido para sempre de quem já
 * tinha salvo um filtro — e a lista da tela nem conhecia esses tipos, então
 * eles não apareciam para ninguém.
 */
const STORAGE_KEY = "alleone.mailbox.kindFiltersOcultos";

/** Formato antigo: a lista do que mostrar. Lido uma vez e convertido. */
const STORAGE_KEY_ANTIGO = "alleone.mailbox.kindFilters";

/** Os tipos que a tela conhecia quando o formato antigo foi salvo. */
const TIPOS_DO_FORMATO_ANTIGO: MailboxNotificationKind[] = [
  "RENDIMENTO_ALERT",
  "RENDIMENTO_APPROVAL_PENDING",
  "CONTRACT_USAGE",
  "GMUD_PENDING_APPROVAL",
  "TICKET_NO_APPOINTMENT_24H",
  "TICKET_STALLED_48H",
  "TICKET_STALLED_7D",
  "INVENTORY_EXPIRY",
  "TIFLUX_SYNC_STALE",
];

function listaDeTipos(raw: string | null): MailboxNotificationKind[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((k): k is MailboxNotificationKind => typeof k === "string");
  } catch {
    return null;
  }
}

/**
 * Converte o filtro antigo ("mostrar estes") em "esconder estes": só esconde o
 * que a pessoa desmarcou entre os tipos que existiam na época. Tipo novo não
 * estava na lista dela, então não fica escondido.
 */
export function ocultosDoFiltroAntigo(
  mostrados: MailboxNotificationKind[],
): MailboxNotificationKind[] {
  return TIPOS_DO_FORMATO_ANTIGO.filter((k) => !mostrados.includes(k));
}

/** Aparece? Tipo que a tela ainda não conhece aparece sempre. */
export function mostrarTipo(
  kind: MailboxNotificationKind,
  mostrados: MailboxNotificationKind[],
): boolean {
  return !ALL_MAILBOX_KINDS.includes(kind) || mostrados.includes(kind);
}

/** Os tipos marcados na tela: todos, menos os escondidos. */
export function mostradosAPartirDeOcultos(
  ocultos: MailboxNotificationKind[],
): MailboxNotificationKind[] {
  const mostrados = ALL_MAILBOX_KINDS.filter((k) => !ocultos.includes(k));
  // Esconder tudo não faz sentido na tela (ela avisa "nenhum tipo"): volta a mostrar tudo.
  return mostrados.length ? mostrados : [...ALL_MAILBOX_KINDS];
}

export function loadMailboxKindFilters(): MailboxNotificationKind[] {
  if (typeof window === "undefined") return [...ALL_MAILBOX_KINDS];
  try {
    const ocultos = listaDeTipos(localStorage.getItem(STORAGE_KEY));
    if (ocultos) return mostradosAPartirDeOcultos(ocultos);

    const antigos = listaDeTipos(localStorage.getItem(STORAGE_KEY_ANTIGO));
    if (antigos) {
      const convertidos = ocultosDoFiltroAntigo(antigos);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(convertidos));
      localStorage.removeItem(STORAGE_KEY_ANTIGO);
      return mostradosAPartirDeOcultos(convertidos);
    }
    return [...ALL_MAILBOX_KINDS];
  } catch {
    return [...ALL_MAILBOX_KINDS];
  }
}

export function saveMailboxKindFilters(kinds: MailboxNotificationKind[]) {
  if (typeof window === "undefined") return;
  try {
    const ocultos = ALL_MAILBOX_KINDS.filter((k) => !kinds.includes(k));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ocultos));
  } catch {
    // Navegador sem armazenamento (aba anônima, bloqueio): o filtro só não fica salvo.
  }
}
