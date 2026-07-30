/** Flags do cutover tickets portal ↔ TiFlux. Ver docs/CUTOVER_TIFLUX.md e CUTOVER_RUNBOOK.md */

/** List/detail leem `portal_tickets` em vez de `tiflux.tickets`. */
export function isTicketsPortalCanonical(): boolean {
  return process.env.TICKETS_PORTAL_CANONICAL === 'true';
}

function parseEnvFlag(
  raw: string | undefined,
): boolean | undefined {
  const v = raw?.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
  if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  return undefined;
}

/** Valor bruto de `TICKETS_TIFLUX_WRITE` (default true). Sem checar disconnect. */
function isTicketsTifluxWriteEnvEnabled(): boolean {
  const parsed = parseEnvFlag(process.env.TICKETS_TIFLUX_WRITE);
  if (parsed === false) return false;
  return true;
}

/**
 * Create/stage ainda chamam a API TiFlux.
 * Default: true (comportamento legado). Defina `false` para portal-only.
 * Sempre false quando `TIFLUX_DISCONNECTED`.
 */
export function isTicketsTifluxWriteEnabled(): boolean {
  if (isTifluxDisconnected()) return false;
  return isTicketsTifluxWriteEnvEnabled();
}

/**
 * Desvinculação total em runtime: sem API TiFlux, sem outbox, sem fallback live.
 * - Explícito: `TIFLUX_DISCONNECTED=true`
 * - Ou cutover completo: CANONICAL=true + WRITE=false
 */
export function isTifluxDisconnected(): boolean {
  const parsed = parseEnvFlag(process.env.TIFLUX_DISCONNECTED);
  if (parsed === true) return true;
  if (parsed === false) return false;
  return isTicketsPortalCanonical() && !isTicketsTifluxWriteEnvEnabled();
}

/** Chamadas HTTP à API TiFlux em runtime (histórico live, charts, etc.). */
export function isTifluxRuntimeApiEnabled(): boolean {
  if (isTifluxDisconnected()) return false;
  return process.env.TIFLUX_RUNTIME_API === 'true';
}
