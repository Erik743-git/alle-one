-- Alerta de sync TiFlux stale no correio (admins)
ALTER TYPE "MailboxNotificationKind" ADD VALUE IF NOT EXISTS 'TIFLUX_SYNC_STALE';
