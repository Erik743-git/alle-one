import { API_URL } from "@/lib/env";
import { clearSession } from "@/lib/session";

export { API_URL };

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  auth?: boolean;
};

function resolveApiErrorMessage(
  rawText: string,
  status: number,
  apiMessage: string | null,
): string {
  if (apiMessage) return apiMessage;

  const trimmed = rawText.trim();
  if (!trimmed) {
    return `Erro ao processar a requisição (${status}).`;
  }

  const looksLikeHtml =
    trimmed.startsWith("<!") ||
    trimmed.startsWith("<html") ||
    trimmed.includes("<!DOCTYPE");

  if (looksLikeHtml) {
    if (status === 404) {
      return "Serviço não encontrado. A configuração do servidor pode estar desatualizada.";
    }
    return `Erro no servidor (${status}). Tente novamente em instantes.`;
  }

  if (trimmed.length > 280) {
    return `Erro ao processar a requisição (${status}).`;
  }

  return trimmed;
}

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

  const headerRecord = headers as Record<string, string>;
  if (auth) {
    headerRecord["X-Alleone-Api"] = "1";
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
    throw new Error(
      resolveApiErrorMessage(rawText, response.status, apiMessage),
    );
  }

  if (!rawText) {
    return null as T;
  }

  return data as T;
}
