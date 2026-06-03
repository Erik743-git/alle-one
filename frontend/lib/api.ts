import { API_URL } from "@/lib/env";
import { clearSession, getStoredToken } from "@/lib/session";

export { API_URL };

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  auth?: boolean;
};

export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, auth = true } = options;

  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;

  const headers: HeadersInit = isFormData
    ? {}
    : {
        "Content-Type": "application/json",
      };

  if (auth) {
    const token = getStoredToken();
    if (token) {
      (headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    credentials: "include",
    headers,
    body: !body
      ? undefined
      : isFormData
        ? (body as FormData)
        : JSON.stringify(body),
  });

  if (response.status === 401) {
    clearSession();
    if (typeof window !== "undefined") {
      window.location.replace("/login");
    }
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  if (response.status === 204) {
    return null as T;
  }

  let data: T | { message?: string | string[] } | null = null;
  const rawText = await response.text().catch(() => "");
  if (rawText) {
    try {
      data = JSON.parse(rawText) as T | { message?: string | string[] };
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const apiMessage =
      data &&
      typeof data === "object" &&
      "message" in data &&
      data.message
        ? Array.isArray(data.message)
          ? data.message.join(", ")
          : data.message
        : null;
    const message =
      apiMessage ||
      rawText ||
      `Erro ao processar a requisição (${response.status}).`;

    throw new Error(message);
  }

  if (!rawText) {
    return null as T;
  }

  return data as T;
}
