export const RESET_EMAIL_STORAGE_KEY = "alleone.reset.email";
export const RESET_COOLDOWN_UNTIL_KEY = "alleone.reset.cooldownUntil";
export const RESET_DEV_CODE_KEY = "alleone.reset.devCode";

export const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;

export function saveResetEmail(email: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(RESET_EMAIL_STORAGE_KEY, email.trim().toLowerCase());
}

export function getResetEmail(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(RESET_EMAIL_STORAGE_KEY);
}

export function clearResetFlow() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(RESET_EMAIL_STORAGE_KEY);
  sessionStorage.removeItem(RESET_COOLDOWN_UNTIL_KEY);
  sessionStorage.removeItem(RESET_DEV_CODE_KEY);
}

export function saveDevResetCode(code: string | undefined) {
  if (typeof window === "undefined" || !code) return;
  if (process.env.NODE_ENV === "production") return;
  sessionStorage.setItem(RESET_DEV_CODE_KEY, code);
}

export function getDevResetCode(): string | null {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") {
    return null;
  }
  return sessionStorage.getItem(RESET_DEV_CODE_KEY);
}

export function setResendCooldown(seconds: number) {
  if (typeof window === "undefined") return;
  const until = Date.now() + seconds * 1000;
  sessionStorage.setItem(RESET_COOLDOWN_UNTIL_KEY, String(until));
}

export function getResendCooldownRemainingMs(): number {
  if (typeof window === "undefined") return 0;
  const raw = sessionStorage.getItem(RESET_COOLDOWN_UNTIL_KEY);
  if (!raw) return 0;
  const until = Number(raw);
  if (!Number.isFinite(until)) return 0;
  return Math.max(0, until - Date.now());
}

export type ForgotPasswordResponse = {
  message?: string;
  email?: string;
  resendCooldownSeconds?: number;
  /** Somente em desenvolvimento (e-mail fictício no cadastro). */
  devCode?: string;
};

export async function requestPasswordResetCode(
  apiUrl: string,
  email: string,
): Promise<ForgotPasswordResponse> {
  const response = await fetch(`${apiUrl}/auth/esqueci-senha`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim() }),
  });

  const data = (await response.json()) as ForgotPasswordResponse & {
    message?: string | string[];
  };

  if (!response.ok) {
    const msg = Array.isArray(data.message)
      ? data.message.join(", ")
      : data.message;
    throw new Error(msg || "Não foi possível enviar o código.");
  }

  return data;
}
