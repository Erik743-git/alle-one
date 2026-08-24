const SKIP_KEY = "alle-one.skip-no-responsible-preticket-warning";

export function shouldShowNoResponsiblePreTicketWarning(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(SKIP_KEY) !== "1";
}

export function setSkipNoResponsiblePreTicketWarning(skip: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SKIP_KEY, skip ? "1" : "0");
}
