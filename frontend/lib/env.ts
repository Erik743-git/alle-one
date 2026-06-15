/** URL da API Alle One (definida no build via NEXT_PUBLIC_API_URL). */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:3002";

/**
 * Base para fetch no navegador: mesma origem usa path relativo (Nginx/rewrite).
 * Evita falha silenciosa quando o build aponta para host errado ou há mixed content.
 */
export function getBrowserApiBase(): string {
  if (typeof window === "undefined") {
    return API_URL.replace(/\/$/, "");
  }

  const configured = API_URL.replace(/\/$/, "");
  try {
    if (new URL(configured).origin === window.location.origin) {
      return "";
    }
  } catch {
    /* URL inválida no build — tenta relativo na mesma origem */
    return "";
  }

  return configured;
}
