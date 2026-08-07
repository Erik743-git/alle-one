/** Faixa reservada para responsável portal-only (evita colidir com IDs TiFlux). */
export const PORTAL_RESPONSIBLE_ID_BASE = 2_100_000_000;

/** ID estável derivado do UUID do usuário portal quando não há match em tiflux.users. */
export function portalResponsibleSyntheticId(userId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < userId.length; i += 1) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return PORTAL_RESPONSIBLE_ID_BASE + ((hash >>> 0) % 100_000_000);
}

export function resolveResponsibleExternalId(
  userId: string,
  tifluxExternalId: number | null | undefined,
): number {
  if (
    tifluxExternalId != null &&
    Number.isFinite(tifluxExternalId) &&
    tifluxExternalId > 0
  ) {
    return tifluxExternalId;
  }
  return portalResponsibleSyntheticId(userId);
}
