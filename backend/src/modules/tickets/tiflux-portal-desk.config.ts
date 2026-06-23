/** Normaliza nome de mesa para comparação (case/ espaços insensitive). */
export function normalizeDeskName(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

const DEFAULT_PORTAL_DESK_NAME = 'AlleOne';

/** ID TiFlux da mesa AlleOne (opcional; prioridade sobre o nome). */
export function getTifluxPortalDeskId(): number | null {
  const raw = process.env.TIFLUX_PORTAL_DESK_ID?.trim();
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Nome da mesa TiFlux usada pelo portal para sync de apontamentos. */
export function getTifluxPortalDeskName(): string {
  const fromEnv = process.env.TIFLUX_PORTAL_DESK_NAME?.trim();
  return fromEnv || DEFAULT_PORTAL_DESK_NAME;
}

/** Apontamentos sincronizam com TiFlux quando o ticket pertence à mesa AlleOne (ID ou nome). */
export function isAlleOneTifluxDesk(
  deskExternalId: number | null | undefined,
  deskName: string | null | undefined,
): boolean {
  const expectedName = normalizeDeskName(getTifluxPortalDeskName());
  const actualName = normalizeDeskName(deskName);
  const nameMatch = expectedName.length > 0 && actualName === expectedName;

  const configuredId = getTifluxPortalDeskId();
  if (configuredId != null) {
    return Number(deskExternalId) === configuredId || nameMatch;
  }

  return nameMatch;
}
