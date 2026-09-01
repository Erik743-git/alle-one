/** URL pública da API (build do browser via NEXT_PUBLIC_API_URL). */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:3002";

/** URL interna no servidor (VM → API local, sem hairpin pelo Cloudflare). */
function getServerApiBase(): string {
  const internal = process.env.API_INTERNAL_URL?.trim();
  if (internal) return internal.replace(/\/$/, "");
  return API_URL.replace(/\/$/, "");
}

function normalizeApiPath(pathname: string): string {
  const trimmed = pathname.replace(/\/$/, "");
  return trimmed === "/" ? "" : trimmed;
}

/**
 * Base para fetch no navegador.
 * - Mesma origem com prefixo `/api` → retorna `/api`.
 * - Mesma origem sem path → `/api` (Nginx em produção; login via `/auth/` é exceção em auth-api-url).
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
      const path = normalizeApiPath(configured.pathname);
      // Build sem /api na URL pública: dados devem ir a /api/* (Nginx), não ao proxy Next.
      return path || "/api";
    }
    return trimmed;
  } catch {
    if (trimmed.startsWith("/")) {
      const path = normalizeApiPath(trimmed);
      return path || "/api";
    }
    return "/api";
  }
}

/** Monta URL da API para o endpoint (browser ou SSR). */
export function buildApiUrl(endpoint: string): string {
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  if (typeof window === "undefined") {
    return `${getServerApiBase()}${path}`;
  }

  const base = getBrowserApiBase();
  if (!base) return path;
  if (base.startsWith("http://") || base.startsWith("https://")) {
    return `${base}${path}`;
  }
  return `${base}${path}`;
}
