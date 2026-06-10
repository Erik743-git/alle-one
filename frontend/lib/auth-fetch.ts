import { getStoredToken, clearSession } from "@/lib/session";

function handleUnauthorized(): void {
  clearSession();
  if (typeof window !== "undefined") {
    window.location.replace("/login");
  }
}

/** fetch autenticado: envia cookie httpOnly e, se existir, Bearer legado. */
export async function authFetch(
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

  const response = await fetch(input, {
    ...init,
    credentials: "include",
    headers,
  });

  if (response.status === 401) {
    handleUnauthorized();
  }

  return response;
}
