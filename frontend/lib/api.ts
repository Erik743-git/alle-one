import { API_URL } from "@/lib/env";
import { isPublicRoute } from "@/lib/auth";
import { endSession } from "@/lib/session";

export { API_URL };

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  auth?: boolean;
  /** Se true, 401 não encerra a sessão (ex.: validação pós-login). */
  skipSessionEnd?: boolean;
};

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

function extractApiMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;

  const message = record.message;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message)) {
    const joined = message.filter((m) => typeof m === "string").join(", ");
    return joined || null;
  }
  if (message && typeof message === "object") {
    const nested = message as Record<string, unknown>;
    if (typeof nested.message === "string" && nested.message.trim()) {
      return nested.message;
    }
  }
  return null;
}

/** Corpo útil do erro (objeto aninhado em `message` ou o próprio body). */
export function getApiErrorPayload(
  err: unknown,
): Record<string, unknown> | null {
  if (!(err instanceof ApiRequestError)) return null;
  const body = err.body;
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (
    record.message &&
    typeof record.message === "object" &&
    !Array.isArray(record.message)
  ) {
    return record.message as Record<string, unknown>;
  }
  return record;
}

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
  const { method = "GET", body, auth = true, skipSessionEnd = false } = options;

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
    const onPublic =
      typeof window !== "undefined" &&
      isPublicRoute(window.location.pathname);
    if (!skipSessionEnd && !onPublic) {
      void endSession("expired");
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
    const apiMessage = extractApiMessage(data);
    throw new ApiRequestError(
      resolveApiErrorMessage(
        rawText,
        response.status,
        typeof apiMessage === "string" ? apiMessage : null,
      ),
      response.status,
      data,
    );
  }

  if (!rawText) {
    return null as T;
  }

  return data as T;
}
