/**
 * Guias do portal: cada troca de página vira uma guia, até PORTAL_TABS_LIMIT.
 * Tudo aqui é puro (sem React, sem navegador) para ser testável; o provider
 * só aplica estas funções e navega.
 */

export const PORTAL_TABS_LIMIT = 10;

export type PortalTab = {
  id: string;
  /** Caminho + query, exatamente como a página foi aberta. */
  href: string;
  title: string;
  /** Título informado pela própria página (ex.: "#81247 - Validação Backup"). */
  customTitle?: boolean;
  /**
   * Chave da entrada no histórico do navegador (Navigation API). Um
   * redirecionamento (router.replace) mantém a chave — é assim que a guia
   * atual vira a página nova em vez de abrir outra.
   */
  entryKey?: string | null;
  lastActiveAt: number;
};

export type PortalTabsState = {
  tabs: PortalTab[];
  activeId: string | null;
};

export const EMPTY_TABS: PortalTabsState = { tabs: [], activeId: null };

export type RouteChange = {
  href: string;
  entryKey: string | null;
  now: number;
  newId: () => string;
};

export type TabsResult = {
  state: PortalTabsState;
  /** Guias fechadas para respeitar o limite. */
  evicted: PortalTab[];
};

export function pathOf(href: string): string {
  return href.split("#")[0].split("?")[0] || "/";
}

function getActive(state: PortalTabsState): PortalTab | null {
  return state.tabs.find((tab) => tab.id === state.activeId) ?? null;
}

function withTab(
  state: PortalTabsState,
  id: string,
  patch: Partial<PortalTab>,
): PortalTabsState {
  return {
    ...state,
    tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)),
  };
}

/** Fecha as guias usadas há mais tempo até caber no limite (a ativa nunca sai). */
function enforceLimit(state: PortalTabsState): TabsResult {
  if (state.tabs.length <= PORTAL_TABS_LIMIT) return { state, evicted: [] };
  const excess = state.tabs.length - PORTAL_TABS_LIMIT;
  const evicted = state.tabs
    .filter((tab) => tab.id !== state.activeId)
    .sort((a, b) => a.lastActiveAt - b.lastActiveAt)
    .slice(0, excess);
  const gone = new Set(evicted.map((tab) => tab.id));
  return {
    state: { ...state, tabs: state.tabs.filter((tab) => !gone.has(tab.id)) },
    evicted,
  };
}

/**
 * A página mudou. Regras:
 *  - mesmo endereço da guia ativa → nada muda;
 *  - redirecionamento (mesma entrada de histórico) ou só a query mudou →
 *    a guia ativa passa a ser o novo endereço;
 *  - endereço já aberto em outra guia → foca essa guia;
 *  - senão → guia nova no fim da barra.
 */
export function applyRouteChange(
  state: PortalTabsState,
  change: RouteChange,
): TabsResult {
  const { href, entryKey, now } = change;
  const active = getActive(state);

  if (active && active.href === href) {
    return {
      state: withTab(state, active.id, {
        lastActiveAt: now,
        entryKey: entryKey ?? active.entryKey ?? null,
      }),
      evicted: [],
    };
  }

  const existing = state.tabs.find((tab) => tab.href === href) ?? null;

  if (active) {
    const samePath = pathOf(active.href) === pathOf(href);
    const redirected =
      !samePath && entryKey != null && active.entryKey === entryKey;

    if (samePath) {
      return {
        state: withTab(state, active.id, {
          href,
          entryKey: entryKey ?? active.entryKey ?? null,
          lastActiveAt: now,
        }),
        evicted: [],
      };
    }

    if (redirected) {
      if (existing) {
        // A página de destino já está aberta: fica ela, a de origem sai.
        return {
          state: {
            tabs: state.tabs
              .filter((tab) => tab.id !== active.id)
              .map((tab) =>
                tab.id === existing.id
                  ? { ...tab, entryKey, lastActiveAt: now }
                  : tab,
              ),
            activeId: existing.id,
          },
          evicted: [],
        };
      }
      return {
        state: withTab(state, active.id, {
          href,
          title: defaultTabTitle(href),
          customTitle: false,
          entryKey,
          lastActiveAt: now,
        }),
        evicted: [],
      };
    }
  }

  if (existing) {
    return {
      state: {
        ...withTab(state, existing.id, {
          lastActiveAt: now,
          entryKey: entryKey ?? existing.entryKey ?? null,
        }),
        activeId: existing.id,
      },
      evicted: [],
    };
  }

  const tab: PortalTab = {
    id: change.newId(),
    href,
    title: defaultTabTitle(href),
    entryKey,
    lastActiveAt: now,
  };
  return enforceLimit({ tabs: [...state.tabs, tab], activeId: tab.id });
}

export function activateTab(
  state: PortalTabsState,
  id: string,
  now: number,
): PortalTabsState {
  if (!state.tabs.some((tab) => tab.id === id)) return state;
  return { ...withTab(state, id, { lastActiveAt: now }), activeId: id };
}

/** Fecha a guia; se era a ativa, passa para a vizinha da direita (ou da esquerda). */
export function closeTab(
  state: PortalTabsState,
  id: string,
  now: number,
): PortalTabsState {
  const index = state.tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return state;
  const tabs = state.tabs.filter((tab) => tab.id !== id);
  if (state.activeId !== id) return { ...state, tabs };
  const next = tabs[index] ?? tabs[index - 1] ?? null;
  if (!next) return { tabs, activeId: null };
  return activateTab({ tabs, activeId: null }, next.id, now);
}

export function closeOtherTabs(
  state: PortalTabsState,
  id: string,
  now: number,
): PortalTabsState {
  const keep = state.tabs.find((tab) => tab.id === id);
  if (!keep) return state;
  return {
    tabs: [{ ...keep, lastActiveAt: now }],
    activeId: keep.id,
  };
}

/** Cópia logo à direita da original, já ativa (como no navegador). */
export function duplicateTab(
  state: PortalTabsState,
  id: string,
  newId: string,
  now: number,
): TabsResult {
  const index = state.tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return { state, evicted: [] };
  const source = state.tabs[index];
  const copy: PortalTab = {
    ...source,
    id: newId,
    entryKey: null,
    lastActiveAt: now,
  };
  const tabs = [...state.tabs];
  tabs.splice(index + 1, 0, copy);
  return enforceLimit({ tabs, activeId: copy.id });
}

export function setTabTitle(
  state: PortalTabsState,
  id: string,
  title: string,
): PortalTabsState {
  const clean = title.trim().replace(/\s+/g, " ").slice(0, 160);
  const tab = state.tabs.find((item) => item.id === id);
  if (!clean || !tab || (tab.customTitle && tab.title === clean)) return state;
  return withTab(state, id, { title: clean, customTitle: true });
}

// --- títulos padrão -----------------------------------------------------------

const STATIC_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/tickets": "Tickets",
  "/tickets/new": "Novo ticket",
  "/tickets/pre-tickets": "Pré-tickets",
  "/console": "Console",
  "/correio": "Correio",
  "/financeiro": "Financeiro",
  "/gmud": "GMUD",
  "/gmud/new": "Nova GMUD",
  "/gerador-relatorios": "Relatórios",
  "/apontamentos": "Apontamentos",
  "/apontamentos/aprovar-horas-extras": "Aprovar horas extras",
  "/apontamentos/aprovar-justificativas": "Aprovar justificativas",
  "/inventario": "Inventário",
  "/projetos": "Projetos",
  "/admin": "Administração",
  "/admin/auditoria": "Auditoria",
  "/admin/classificacao": "Classificação",
  "/admin/email": "E-mail",
  "/admin/empresas": "Empresas",
  "/admin/ticket": "Configuração de tickets",
  "/admin/usuarios": "Usuários",
};

const DYNAMIC_TITLES: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^\/tickets\/pre-tickets\/[^/]+$/, () => "Pré-ticket"],
  [/^\/tickets\/(\d+)\/edit$/, (m) => `Editar #${m[1]}`],
  [/^\/tickets\/(\d+)$/, (m) => `#${m[1]}`],
  [/^\/gmud\/[^/]+$/, () => "GMUD"],
  [/^\/projetos\/[^/]+\/[^/]+$/, () => "Projeto"],
  [/^\/projetos\/[^/]+$/, () => "Projetos"],
  [/^\/inventario\/tipo\/[^/]+$/, () => "Tipo de ativo"],
  [/^\/inventario\/[^/]+$/, () => "Inventário"],
  [/^\/apontamentos\/empresa\/[^/]+$/, () => "Apontamentos da empresa"],
  [/^\/apontamentos\/[^/]+$/, () => "Apontamentos"],
];

export function defaultTabTitle(href: string): string {
  const path = pathOf(href).replace(/\/+$/, "") || "/";
  const fixed = STATIC_TITLES[path];
  if (fixed) return fixed;
  for (const [pattern, title] of DYNAMIC_TITLES) {
    const match = path.match(pattern);
    if (match) return title(match);
  }
  const last = decodeURIComponent(path.split("/").filter(Boolean).pop() ?? "");
  return last ? last.charAt(0).toUpperCase() + last.slice(1) : "Início";
}

// --- persistência -------------------------------------------------------------

export const PORTAL_TABS_STORAGE_PREFIX = "alleone.tabs.";

export function portalTabsStorageKey(userId: string): string {
  return `${PORTAL_TABS_STORAGE_PREFIX}${userId}`;
}

export function serializeTabs(state: PortalTabsState): string {
  return JSON.stringify({ v: 1, ...state });
}

/** Lê o que foi salvo; qualquer coisa estranha vira "sem guias". */
export function parseTabs(raw: string | null | undefined): PortalTabsState {
  if (!raw) return EMPTY_TABS;
  try {
    const data = JSON.parse(raw) as {
      v?: number;
      tabs?: unknown;
      activeId?: unknown;
    };
    if (data?.v !== 1 || !Array.isArray(data.tabs)) return EMPTY_TABS;
    const tabs: PortalTab[] = [];
    const seen = new Set<string>();
    for (const item of data.tabs as Array<Partial<PortalTab>>) {
      if (
        !item ||
        typeof item.id !== "string" ||
        typeof item.href !== "string" ||
        !item.href.startsWith("/") ||
        item.href.startsWith("//") ||
        seen.has(item.id)
      ) {
        continue;
      }
      seen.add(item.id);
      tabs.push({
        id: item.id,
        href: item.href,
        title:
          typeof item.title === "string" && item.title.trim()
            ? item.title
            : defaultTabTitle(item.href),
        customTitle: Boolean(item.customTitle),
        entryKey: null,
        lastActiveAt:
          typeof item.lastActiveAt === "number" ? item.lastActiveAt : 0,
      });
    }
    const limited = tabs.slice(-PORTAL_TABS_LIMIT);
    const activeId =
      typeof data.activeId === "string" &&
      limited.some((tab) => tab.id === data.activeId)
        ? data.activeId
        : (limited.at(-1)?.id ?? null);
    return { tabs: limited, activeId };
  } catch {
    return EMPTY_TABS;
  }
}
