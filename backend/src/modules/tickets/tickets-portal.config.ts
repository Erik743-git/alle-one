/** Flags do cutover tickets portal ↔ TiFlux. Ver docs/CUTOVER_TIFLUX.md e CUTOVER_RUNBOOK.md */

/** List/detail leem `portal_tickets` em vez de `tiflux.tickets`. */
export function isTicketsPortalCanonical(): boolean {
  return process.env.TICKETS_PORTAL_CANONICAL === 'true';
}

function parseEnvFlag(raw: string | undefined): boolean | undefined {
  const v = raw?.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
  if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  return undefined;
}

/** Valor de `TICKETS_TIFLUX_WRITE`. Sem checar disconnect. */
function isTicketsTifluxWriteEnvEnabled(): boolean {
  const parsed = parseEnvFlag(process.env.TICKETS_TIFLUX_WRITE);
  if (parsed === true) return true;
  if (parsed === false) return false;
  // Cutover: se a leitura já é portal, não chama a API TiFlux sem WRITE explícito.
  return !isTicketsPortalCanonical();
}

/**
 * Escrita na API TiFlux (create/update ticket, estágio outbound).
 * Padrão portal canônico: **false** — nada do portal vai ao TiFlux.
 * Legado: true quando CANONICAL=false.
 */
export function isTicketsTifluxWriteEnabled(): boolean {
  if (isTifluxDisconnected()) return false;
  return isTicketsTifluxWriteEnvEnabled();
}

/**
 * TiFlux ainda alimenta o portal (espelho inbound `tiflux.*` → ETL → `portal_*`).
 * `false` = desvinculado: para de depender do sync externo; dados já no portal permanecem.
 *
 * **Única flag operacional:** `TIFLUX_DISCONNECTED=true`
 * (não infere automaticamente de CANONICAL/WRITE).
 */
export function isTifluxDisconnected(): boolean {
  const parsed = parseEnvFlag(process.env.TIFLUX_DISCONNECTED);
  if (parsed === true) return true;
  if (parsed === false) return false;
  return false;
}

/** Espelho TiFlux → portal ainda esperado (alleone-tiflux-sync + ETL). */
export function isTifluxInboundSyncEnabled(): boolean {
  return !isTifluxDisconnected();
}

/** Tipos de atendimento disponíveis no apontamento (parametrizável por env). */
export function getTicketAppointmentServiceTypes(): string[] {
  const raw = process.env.TICKET_APPOINTMENT_SERVICE_TYPES?.trim();
  if (raw) {
    const parsed = raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (parsed.length > 0) return parsed;
  }
  return ['HORA NORMAL', 'HORA EXTRA', 'PLANTÃO'];
}

/** Chamadas HTTP à API TiFlux em runtime (histórico live, charts, etc.). */
export function isTifluxRuntimeApiEnabled(): boolean {
  if (isTifluxDisconnected()) return false;
  return process.env.TIFLUX_RUNTIME_API === 'true';
}
