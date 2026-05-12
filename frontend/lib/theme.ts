export type ThemeMode = "dark" | "light";

const STORAGE_KEY = "alleone.theme";

export function getStoredTheme(): ThemeMode | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === "light" || raw === "dark" ? raw : null;
}

export function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function setStoredTheme(theme: ThemeMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, theme);
}

export function getEffectiveTheme(): ThemeMode {
  return getStoredTheme() ?? "dark";
}

