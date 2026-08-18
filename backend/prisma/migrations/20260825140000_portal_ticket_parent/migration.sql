ALTER TABLE "portal_tickets"
  ADD COLUMN IF NOT EXISTS "parent_ticket_number" INTEGER;

CREATE INDEX IF NOT EXISTS "portal_tickets_parent_ticket_number_idx"
  ON "portal_tickets"("parent_ticket_number");
