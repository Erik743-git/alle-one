-- Garante sync_paused_at após a criação da tabela (migration 20260623 pode ter sido no-op).
ALTER TABLE "portal_ticket_appointments"
  ADD COLUMN IF NOT EXISTS "sync_paused_at" TIMESTAMPTZ;
