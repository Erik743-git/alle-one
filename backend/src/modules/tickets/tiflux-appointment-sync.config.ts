import { isTifluxDisconnected } from './tickets-portal.config';

/** Apontamentos do portal → API TiFlux. Padrao: desligado (somente PORTAL_ONLY). */
export function isTifluxAppointmentSyncEnabled(): boolean {
  if (isTifluxDisconnected()) return false;
  return process.env.TIFLUX_APPOINTMENT_SYNC_ENABLED === 'true';
}
