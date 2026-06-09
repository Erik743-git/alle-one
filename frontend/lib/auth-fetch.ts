import { getStoredToken } from "@/lib/session";

/** fetch autenticado: envia cookie httpOnly e, se existir, Bearer legado. */
export function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers ?? undefined);
  if (!headers.has("X-Alleone-Api")) {
    headers.set("X-Alleone-Api", "1");
  }
  const token = getStoredToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, {
    ...init,
    credentials: "include",
    headers,
  });
}
