/** Apontamentos do portal → API TiFlux. Padrao: desligado (somente PORTAL_ONLY). */
export function isTifluxAppointmentSyncEnabled(): boolean {
  return process.env.TIFLUX_APPOINTMENT_SYNC_ENABLED === 'true';
}
