ALTER TYPE "TicketAutoOpenPeriodicity" ADD VALUE IF NOT EXISTS 'SEMIANNUAL';

-- Rotinas antigas sem responsável explícito: atribuir ao criador da regra (não pré-ticket).
UPDATE "ticket_auto_open_rules"
SET "responsible_external_id" = 0
WHERE "responsible_external_id" IS NULL
  AND "deleted_at" IS NULL;
