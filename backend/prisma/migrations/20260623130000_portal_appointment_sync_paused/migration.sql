-- Tabela `portal_ticket_appointments` só é criada em 20260810120000.
-- Em DB limpo esta migration roda antes: só altera se a relação já existir.
DO $$
BEGIN
  IF to_regclass('public.portal_ticket_appointments') IS NOT NULL THEN
    ALTER TABLE "portal_ticket_appointments"
      ADD COLUMN IF NOT EXISTS "sync_paused_at" TIMESTAMPTZ;
  END IF;
END $$;
