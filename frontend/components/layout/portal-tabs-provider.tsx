"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import { getDefaultAppRoute } from "@/lib/access-control";
import { notify, notifyError, notifySuccess } from "@/lib/notify";
import { useAuth } from "@/lib/use-auth";
import {
  EMPTY_TABS,
  PORTAL_TABS_LIMIT,
  activateTab as activateTabState,
  applyRouteChange,
  closeOtherTabs as closeOtherTabsState,
  closeTab as closeTabState,
  duplicateTab as duplicateTabState,
  parseTabs,
  pathOf,
  portalTabsStorageKey,
  serializeTabs,
  setTabTitle,
  type PortalTab,
  type PortalTabsState,
} from "@/lib/portal-tabs/tab-model";

type PortalTabsApi = {
  tabs: PortalTab[];
  activeId: string | null;
  activateTab: (id: string) => void;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeAllTabs: () => void;
  duplicateTab: (id: string) => void;
  copyTabLink: (id: string) => void;
  /** Usado pela barra a cada troca de endereço. */
  syncRoute: (href: string) => void;
  /** A página informa um título melhor que o padrão da rota. */
  setActiveTitle: (pathname: string, title: string) => void;
};

const PortalTabsContext = createContext<PortalTabsApi | null>(null);

// --- store das guias (vive fora do React; o localStorage é a fonte) ----------

type TabsSnapshot = { userId: string | null; state: PortalTabsState };

const SERVER_SNAPSHOT: TabsSnapshot = { userId: null, state: EMPTY_TABS };
let snapshot: TabsSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => SERVER_SNAPSHOT;

function loadFor(userId: string | null) {
  let state = EMPTY_TABS;
  if (userId) {
    try {
      state = parseTabs(
        window.localStorage.getItem(portalTabsStorageKey(userId)),
      );
    } catch {
      state = EMPTY_TABS;
    }
  }
  snapshot = { userId, state };
  emit();
}

function commit(state: PortalTabsState) {
  if (state === snapshot.state) return;
  snapshot = { ...snapshot, state };
  if (snapshot.userId) {
    try {
      window.localStorage.setItem(
        portalTabsStorageKey(snapshot.userId),
        serializeTabs(state),
      );
    } catch {
      // Armazenamento cheio ou bloqueado: as guias só não sobrevivem ao F5.
    }
  }
  emit();
}

function current(): PortalTabsState {
  return snapshot.state;
}

function activeOf(state: PortalTabsState): PortalTab | null {
  return state.tabs.find((tab) => tab.id === state.activeId) ?? null;
}

function newTabId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Chave da entrada atual do histórico; replace mantém, push troca. */
function currentEntryKey(): string | null {
  const nav = (
    globalThis as { navigation?: { currentEntry?: { key?: string } | null } }
  ).navigation;
  return nav?.currentEntry?.key ?? null;
}

function currentHref(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function warnEvicted(evicted: PortalTab[]) {
  for (const tab of evicted) {
    notify(
      `A guia "${tab.title}" foi fechada: o limite é de ${PORTAL_TABS_LIMIT} guias abertas.`,
    );
  }
}

// --- provider ---------------------------------------------------------------

export function PortalTabsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Guias pertencem ao login: sem usuário não há guias; outro usuário lê as dele.
  useEffect(() => {
    if (snapshot.userId !== userId) loadFor(userId);
  }, [userId]);

  // Logout em outra janela apaga a chave: aqui as guias somem também.
  useEffect(() => {
    if (!userId) return;
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === portalTabsStorageKey(userId) &&
        event.newValue === null
      ) {
        loadFor(userId);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId]);

  const ready = userId !== null && snap.userId === userId;

  const goTo = useCallback(
    (tab: PortalTab | null) => {
      const href = tab?.href ?? getDefaultAppRoute();
      if (href !== currentHref()) router.push(href);
    },
    [router],
  );

  const syncRoute = useCallback(
    (href: string) => {
      if (!ready) return;
      const result = applyRouteChange(current(), {
        href,
        entryKey: currentEntryKey(),
        now: Date.now(),
        newId: newTabId,
      });
      commit(result.state);
      warnEvicted(result.evicted);
    },
    [ready],
  );

  const activateTab = useCallback(
    (id: string) => {
      const next = activateTabState(current(), id, Date.now());
      commit(next);
      goTo(activeOf(next));
    },
    [goTo],
  );

  const closeTab = useCallback(
    (id: string) => {
      const before = current();
      const next = closeTabState(before, id, Date.now());
      commit(next);
      if (before.activeId === id) goTo(activeOf(next));
    },
    [goTo],
  );

  const closeOtherTabs = useCallback(
    (id: string) => {
      const next = closeOtherTabsState(current(), id, Date.now());
      commit(next);
      goTo(activeOf(next));
    },
    [goTo],
  );

  const closeAllTabs = useCallback(() => {
    const home = getDefaultAppRoute();
    // Fica só a tela inicial; se já estamos nela, a guia nasce aqui mesmo.
    const next = applyRouteChange(EMPTY_TABS, {
      href: home,
      entryKey: home === currentHref() ? currentEntryKey() : null,
      now: Date.now(),
      newId: newTabId,
    }).state;
    commit(next);
    goTo(activeOf(next));
  }, [goTo]);

  const duplicateTab = useCallback(
    (id: string) => {
      const result = duplicateTabState(current(), id, newTabId(), Date.now());
      commit(result.state);
      goTo(activeOf(result.state));
      warnEvicted(result.evicted);
    },
    [goTo],
  );

  const copyTabLink = useCallback((id: string) => {
    const tab = current().tabs.find((item) => item.id === id);
    if (!tab) return;
    const url = `${window.location.origin}${tab.href}`;
    if (!navigator.clipboard) {
      notifyError("Não foi possível copiar o link.");
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => notifySuccess("Link copiado."))
      .catch(() => notifyError("Não foi possível copiar o link."));
  }, []);

  const setActiveTitle = useCallback((forPath: string, title: string) => {
    const active = activeOf(current());
    // A página pode terminar de carregar depois de trocarmos de guia.
    if (!active || pathOf(active.href) !== forPath) return;
    commit(setTabTitle(current(), active.id, title));
  }, []);

  const tabs = ready ? snap.state.tabs : EMPTY_TABS.tabs;
  const activeId = ready ? snap.state.activeId : null;

  const api = useMemo<PortalTabsApi>(
    () => ({
      tabs,
      activeId,
      activateTab,
      closeTab,
      closeOtherTabs,
      closeAllTabs,
      duplicateTab,
      copyTabLink,
      syncRoute,
      setActiveTitle,
    }),
    [
      tabs,
      activeId,
      activateTab,
      closeTab,
      closeOtherTabs,
      closeAllTabs,
      duplicateTab,
      copyTabLink,
      syncRoute,
      setActiveTitle,
    ],
  );

  return (
    <PortalTabsContext.Provider value={api}>
      {children}
    </PortalTabsContext.Provider>
  );
}

export function usePortalTabs(): PortalTabsApi {
  const ctx = useContext(PortalTabsContext);
  if (!ctx) {
    throw new Error(
      "usePortalTabs deve ser usado dentro de PortalTabsProvider.",
    );
  }
  return ctx;
}

/**
 * Título da guia da página atual. Passe `null` enquanto os dados carregam.
 * Ex.: `usePortalTabTitle(ticket ? `#${n} - ${ticket.title}` : null)`.
 */
export function usePortalTabTitle(title: string | null | undefined) {
  const ctx = useContext(PortalTabsContext);
  const pathname = usePathname();
  const setActiveTitle = ctx?.setActiveTitle;
  // A guia só existe depois da primeira sincronização da rota.
  const hasTabs = (ctx?.tabs.length ?? 0) > 0;
  useEffect(() => {
    if (title && setActiveTitle && hasTabs) setActiveTitle(pathname, title);
  }, [title, pathname, setActiveTitle, hasTabs]);
}
