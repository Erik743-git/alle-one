"use client";

import * as React from "react";
import {
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_EXPANDED,
} from "./sidebar-context.constants";

const STORAGE_KEY = "alleone.sidebar.collapsed";

export {
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_EXPANDED,
} from "./sidebar-context.constants";

type SidebarContextValue = {
  collapsed: boolean;
  mobileOpen: boolean;
  /** true enquanto a largura do menu anima (gráficos devem ignorar resize). */
  isLayoutAnimating: boolean;
  toggleCollapsed: () => void;
  setMobileOpen: (open: boolean) => void;
  endLayoutAnimation: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function readCollapsedFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistCollapsed(next: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function applySidebarWidth(collapsed: boolean) {
  if (collapsed) {
    document.documentElement.style.removeProperty("--sidebar-width");
  } else {
    document.documentElement.style.setProperty(
      "--sidebar-width",
      `${SIDEBAR_WIDTH_EXPANDED}px`,
    );
  }
  document.documentElement.dataset.sidebarCollapsed = collapsed ? "true" : "false";
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(readCollapsedFromStorage);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [isLayoutAnimating, setIsLayoutAnimating] = React.useState(false);

  React.useLayoutEffect(() => {
    applySidebarWidth(collapsed);
  }, [collapsed]);

  const endLayoutAnimation = React.useCallback(() => {
    setIsLayoutAnimating(false);
    document.documentElement.dataset.sidebarResizing = "false";
  }, []);

  const toggleCollapsed = React.useCallback(() => {
    setIsLayoutAnimating(true);
    document.documentElement.dataset.sidebarResizing = "true";

    setCollapsed((prev) => {
      const next = !prev;
      window.setTimeout(() => persistCollapsed(next), 0);
      return next;
    });

    window.setTimeout(endLayoutAnimation, 220);
  }, [endLayoutAnimation]);

  const value = React.useMemo(
    () => ({
      collapsed,
      mobileOpen,
      isLayoutAnimating,
      toggleCollapsed,
      setMobileOpen,
      endLayoutAnimation,
    }),
    [
      collapsed,
      mobileOpen,
      isLayoutAnimating,
      toggleCollapsed,
      endLayoutAnimation,
    ],
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar deve ser usado dentro de SidebarProvider");
  }
  return ctx;
}
