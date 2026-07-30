import {
  isTicketsPortalCanonical,
  isTicketsTifluxWriteEnabled,
  isTifluxDisconnected,
  isTifluxRuntimeApiEnabled,
} from './tickets-portal.config';

describe('tickets-portal.config disconnect', () => {
  const keys = [
    'TICKETS_PORTAL_CANONICAL',
    'TICKETS_TIFLUX_WRITE',
    'TIFLUX_DISCONNECTED',
    'TIFLUX_RUNTIME_API',
  ] as const;
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it('TIFLUX_DISCONNECTED=true força write off e runtime off', () => {
    process.env.TIFLUX_DISCONNECTED = 'true';
    process.env.TICKETS_TIFLUX_WRITE = 'true';
    process.env.TIFLUX_RUNTIME_API = 'true';
    expect(isTifluxDisconnected()).toBe(true);
    expect(isTicketsTifluxWriteEnabled()).toBe(false);
    expect(isTifluxRuntimeApiEnabled()).toBe(false);
  });

  it('CANONICAL + WRITE=false implica disconnected', () => {
    process.env.TICKETS_PORTAL_CANONICAL = 'true';
    process.env.TICKETS_TIFLUX_WRITE = 'false';
    expect(isTicketsPortalCanonical()).toBe(true);
    expect(isTifluxDisconnected()).toBe(true);
    expect(isTicketsTifluxWriteEnabled()).toBe(false);
  });
});
