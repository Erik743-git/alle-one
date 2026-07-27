/** Flags do cutover tickets portal ↔ TiFlux. Ver docs/CUTOVER_TIFLUX.md */

/** List/detail leem `portal_tickets` em vez de `tiflux.tickets`. */
export function isTicketsPortalCanonical(): boolean {
  return process.env.TICKETS_PORTAL_CANONICAL === 'true';
}

/**
 * Create/stage ainda chamam a API TiFlux.
 * Default: true (comportamento legado). Defina `false` para portal-only.
 */
export function isTicketsTifluxWriteEnabled(): boolean {
  const raw = process.env.TICKETS_TIFLUX_WRITE?.trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'off') {
    return false;
  }
  return true;
}
