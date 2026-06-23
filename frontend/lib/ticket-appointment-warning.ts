const SKIP_KEY = "alle-one.skip-portal-appointment-tiflux-warning";

export function shouldShowTifluxPortalOnlyWarning(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(SKIP_KEY) !== "1";
}

export function setSkipTifluxPortalOnlyWarning(skip: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SKIP_KEY, skip ? "1" : "0");
}
