/** URL da API Alle One (definida no build via NEXT_PUBLIC_API_URL). */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:3002";

function normalizeApiPath(pathname: string): string {
  const trimmed = pathname.replace(/\/$/, "");
  return trimmed === "/" ? "" : trimmed;
}

/**
 * Base para fetch no navegador.
 * - Mesma origem com prefixo `/api` → retorna `/api` (não pode virar string vazia).
 * - Mesma origem sem path → relativo na raiz (rewrite Next/Nginx legado).
 * - Outra origem/porta → URL absoluta do build.
 */
export function getBrowserApiBase(): string {
  const trimmed = API_URL.replace(/\/$/, "");

  if (typeof window === "undefined") {
    return trimmed;
  }

  try {
    const configured = new URL(trimmed);
    if (configured.origin === window.location.origin) {
      return normalizeApiPath(configured.pathname);
    }
    return trimmed;
  } catch {
    if (trimmed.startsWith("/")) {
      return normalizeApiPath(trimmed);
    }
    return "";
  }
}

/** Monta URL da API para o endpoint (browser ou SSR). */
export function buildApiUrl(endpoint: string): string {
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  if (typeof window === "undefined") {
    return `${API_URL.replace(/\/$/, "")}${path}`;
  }

  const base = getBrowserApiBase();
  if (!base) return path;
  if (base.startsWith("http://") || base.startsWith("https://")) {
    return `${base}${path}`;
  }
  return `${base}${path}`;
}
