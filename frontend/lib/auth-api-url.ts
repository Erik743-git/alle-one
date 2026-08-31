import { buildApiUrl, getBrowserApiBase } from "@/lib/env";

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
    const apiBase = getBrowserApiBase();
    if (apiBase.startsWith("http://") || apiBase.startsWith("https://")) {
      return `${apiBase.replace(/\/$/, "")}${authPath}`;
    }
    if (apiBase) {
      return `${window.location.origin}${apiBase}${authPath}`;
    }
    return `${window.location.origin}${authPath}`;
  }

  return buildApiUrl(authPath);
}
