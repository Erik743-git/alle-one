import { API_URL, buildApiUrl } from "@/lib/env";

function normalizeAuthPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "/auth";
  if (trimmed.startsWith("/auth/")) return trimmed;
  if (trimmed.startsWith("/")) return `/auth${trimmed}`;
  return `/auth/${trimmed}`;
}

/**
 * URL de autenticação no browser.
 * Com `NEXT_PUBLIC_API_URL=…/api`, usa `/api/auth/*` (Nginx → API), não o proxy Next `/auth/*`.
 */
export function buildAuthApiUrl(path: string): string {
  const authPath = normalizeAuthPath(path);

  if (typeof window !== "undefined") {
    const configured = API_URL.trim().replace(/\/$/, "");

    try {
      const url = new URL(configured);
      if (url.origin !== window.location.origin) {
        return `${configured}${authPath}`;
      }
      // Mesma origem: só prefixa quando a URL pública declara um path (ex.: /api).
      // Sem path, auth fica na raiz — não usa o fallback /api de getBrowserApiBase.
      const prefix = url.pathname.replace(/\/+$/, "");
      return `${window.location.origin}${prefix}${authPath}`;
    } catch {
      const prefix = configured.startsWith("/")
        ? configured.replace(/\/+$/, "")
        : "";
      return `${window.location.origin}${prefix}${authPath}`;
    }
  }

  return buildApiUrl(authPath);
}
