/** Backup do trust 2FA quando o cookie httpOnly não sobrevive ao proxy/sessão. */
export const DEVICE_TRUST_STORAGE_KEY = "alleone.device_trust";

export function readDeviceTrustToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(DEVICE_TRUST_STORAGE_KEY);
    return value?.trim() || null;
  } catch {
    return null;
  }
}

export function writeDeviceTrustToken(token: string | null | undefined) {
  if (typeof window === "undefined") return;
  try {
    const value = token?.trim();
    if (!value) {
      window.localStorage.removeItem(DEVICE_TRUST_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(DEVICE_TRUST_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

export function clearDeviceTrustToken() {
  writeDeviceTrustToken(null);
}
