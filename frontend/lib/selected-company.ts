import { ALL_COMPANIES_REPORT_VALUE } from "@/lib/report-types";

const STORAGE_PREFIX = "alleone.selectedCompany";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** UUID válido (empresa, usuário, etc.). */
export function isValidUuid(value: string | null | undefined): value is string {
  const id = value?.trim();
  if (!id) return false;
  return UUID_REGEX.test(id);
}

/** UUID de empresa válido para APIs (exclui __all__ e outros placeholders). */
export function isValidCompanyUuid(
  value: string | null | undefined,
): value is string {
  const id = value?.trim();
  if (!id || id === ALL_COMPANIES_REPORT_VALUE) return false;
  return isValidUuid(id);
}

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}.${userId}`;
}

/** Empresa escolhida no dashboard / financeiro (por usuário). Nunca retorna __all__. */
export function getPersistedCompanyId(
  userId: string | undefined | null,
): string | null {
  if (!userId || typeof window === "undefined") return null;
  const key = storageKey(userId);
  const raw = window.localStorage.getItem(key);
  const id = raw?.trim();
  if (!id) return null;
  if (!isValidCompanyUuid(id)) {
    window.localStorage.removeItem(key);
    return null;
  }
  return id;
}

export function setPersistedCompanyId(
  userId: string | undefined | null,
  companyId: string | null,
): void {
  if (!userId || typeof window === "undefined") return;
  const key = storageKey(userId);
  const trimmed = companyId?.trim();
  if (!trimmed || !isValidCompanyUuid(trimmed)) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, trimmed);
}

/** Remove chaves de empresa inválidas (ex.: __all__ legado) após logout/troca de sessão. */
export function purgeInvalidPersistedCompanyIds(): void {
  if (typeof window === "undefined") return;
  const prefix = `${STORAGE_PREFIX}.`;
  for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const raw = window.localStorage.getItem(key);
    if (!isValidCompanyUuid(raw)) {
      window.localStorage.removeItem(key);
    }
  }
}

/** Restaura a última empresa válida ou usa preferências na ordem informada. */
export function pickCompanyIdFromList(
  companies: Array<{ id: string }>,
  options?: {
    userId?: string | null;
    preferredIds?: Array<string | null | undefined>;
  },
): string | null {
  if (companies.length === 0) return null;

  const valid = new Set(companies.map((c) => c.id));
  const persisted = options?.userId
    ? getPersistedCompanyId(options.userId)
    : null;
  if (persisted && valid.has(persisted)) return persisted;

  for (const candidate of options?.preferredIds ?? []) {
    if (candidate && isValidCompanyUuid(candidate) && valid.has(candidate)) {
      return candidate;
    }
  }

  return companies[0]?.id ?? null;
}
