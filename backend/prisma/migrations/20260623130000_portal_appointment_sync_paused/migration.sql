ALTER TABLE "portal_ticket_appointments"
  ADD COLUMN IF NOT EXISTS "sync_paused_at" TIMESTAMPTZ;
