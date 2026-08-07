const SKIP_KEY = "alle-one.skip-portal-appointment-tiflux-warning";

/** Sempre false: portal-only — sem aviso de dual-write. */
export function shouldShowTifluxPortalOnlyWarning(): boolean {
  return false;
}

export function setSkipTifluxPortalOnlyWarning(skip: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SKIP_KEY, skip ? "1" : "0");
}
