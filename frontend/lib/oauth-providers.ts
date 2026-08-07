import { API_URL, getBrowserApiBase } from "@/lib/env";

export type OAuthProvidersStatus = {
  google: boolean;
  microsoft: boolean;
};

const CACHE_KEY = "alleone.oauth.providers";
const CACHE_TTL_MS = 10 * 60 * 1000;

type CachedProviders = OAuthProvidersStatus & { at: number };

function readCache(): OAuthProvidersStatus | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedProviders;
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return {
      google: Boolean(parsed.google),
      microsoft: Boolean(parsed.microsoft),
    };
  } catch {
    return null;
  }
}

function writeCache(status: OAuthProvidersStatus): void {
  if (typeof window === "undefined") return;
  try {
    const payload: CachedProviders = { ...status, at: Date.now() };
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / privado */
  }
}

function providersUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/auth/oauth/providers`;
  }
  const base = getBrowserApiBase();
  if (base) return `${base}/auth/oauth/providers`;
  return `${API_URL.replace(/\/$/, "")}/auth/oauth/providers`;
}

export function getCachedOAuthProviders(): OAuthProvidersStatus | null {
  return readCache();
}

export async function fetchOAuthProviders(
  options?: { retries?: number },
): Promise<OAuthProvidersStatus> {
  const retries = options?.retries ?? 3;
  const url = providersUrl();
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      const data = (await res.json()) as Partial<OAuthProvidersStatus>;
      const status: OAuthProvidersStatus = {
        google: Boolean(data.google),
        microsoft: Boolean(data.microsoft),
      };
      writeCache(status);
      return status;
    } catch (err) {
      lastError = err;
    }
    if (attempt < retries - 1) {
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }

  const cached = readCache();
  if (cached) return cached;

  throw lastError instanceof Error
    ? lastError
    : new Error("Falha ao carregar login social.");
}
