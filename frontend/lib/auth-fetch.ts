import { endSession } from "@/lib/session";

function handleUnauthorized(): void {
  void endSession("expired");
}

/** fetch autenticado via cookie httpOnly (sem Bearer legado). */
export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers ?? undefined);
  if (!headers.has("X-Alleone-Api")) {
    headers.set("X-Alleone-Api", "1");
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
