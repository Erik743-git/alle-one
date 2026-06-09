const STORAGE_PREFIX = "alleone.selectedCompany";

/** Empresa escolhida no dashboard / financeiro / relatórios (por usuário). */
export function getPersistedCompanyId(
  userId: string | undefined | null,
): string | null {
  if (!userId || typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(`${STORAGE_PREFIX}.${userId}`);
  const id = raw?.trim();
  return id || null;
}

export function setPersistedCompanyId(
  userId: string | undefined | null,
  companyId: string | null,
): void {
  if (!userId || typeof window === "undefined") return;
  const key = `${STORAGE_PREFIX}.${userId}`;
  if (!companyId?.trim()) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, companyId.trim());
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
    if (candidate && valid.has(candidate)) return candidate;
  }

  return companies[0]?.id ?? null;
}
