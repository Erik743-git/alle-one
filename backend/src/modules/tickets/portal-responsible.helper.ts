/** INT4 assinado (Prisma `Int` / Postgres integer). */
export const PRISMA_INT4_MAX = 2_147_483_647;

/**
 * Chave numérica interna do responsável no portal (coluna legado
 * `responsible_external_id`). Não é ID da API TiFlux.
 * Precisa caber em INT4: BASE + (span-1) ≤ 2_147_483_647.
 */
export const PORTAL_RESPONSIBLE_ID_BASE = 1_900_000_000;
const PORTAL_RESPONSIBLE_ID_SPAN = 100_000_000;

export function fitsPrismaInt4(n: number): boolean {
  return Number.isInteger(n) && n >= -2_147_483_648 && n <= PRISMA_INT4_MAX;
}

/** ID estável derivado do UUID do usuário portal quando não há match em tiflux.users. */
export function portalResponsibleSyntheticId(userId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < userId.length; i += 1) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (
    PORTAL_RESPONSIBLE_ID_BASE + ((hash >>> 0) % PORTAL_RESPONSIBLE_ID_SPAN)
  );
}

export function resolveResponsibleExternalId(
  userId: string,
  tifluxExternalId: number | null | undefined,
): number {
  if (
    tifluxExternalId != null &&
    Number.isFinite(tifluxExternalId) &&
    tifluxExternalId > 0 &&
    fitsPrismaInt4(tifluxExternalId)
  ) {
    return tifluxExternalId;
  }
  return portalResponsibleSyntheticId(userId);
}
