import { clearSession, getStoredToken } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

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

  const data = (await response.json().catch(() => null)) as
    | T
    | { message?: string | string[] }
    | null;

  if (!response.ok) {
    const apiMessage =
      data &&
      typeof data === "object" &&
      "message" in data &&
      data.message
        ? Array.isArray(data.message)
          ? data.message[0]
          : data.message
        : null;
    const textMessage = !apiMessage
      ? await response.text().catch(() => "")
      : "";
    const message =
      apiMessage || textMessage || `Erro ao processar a requisição (${response.status}).`;

    throw new Error(message);
  }

  return data as T;
}
