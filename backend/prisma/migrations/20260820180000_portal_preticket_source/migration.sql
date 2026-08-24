-- Pré-ticket no portal: chamados sem responsável aguardando triagem

ALTER TABLE "portal_tickets"
  ADD COLUMN IF NOT EXISTS "is_pre_ticket" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "portal_tickets"
  ADD COLUMN IF NOT EXISTS "became_pre_ticket_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "portal_tickets_is_pre_ticket_idx"
  ON "portal_tickets"("is_pre_ticket");
