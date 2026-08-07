-- Remetentes bloqueados (não viram pré-ticket) + status IGNORED para dedupe.

ALTER TABLE "email_inbound_settings"
  ADD COLUMN IF NOT EXISTS "blocked_senders" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'PreTicketStatus' AND e.enumlabel = 'IGNORED'
  ) THEN
    ALTER TYPE "PreTicketStatus" ADD VALUE 'IGNORED';
  END IF;
END $$;
