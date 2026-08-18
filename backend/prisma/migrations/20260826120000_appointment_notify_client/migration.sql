-- Flag de comunicação com cliente no apontamento.
ALTER TABLE "portal_ticket_appointments"
ADD COLUMN IF NOT EXISTS "notify_client" BOOLEAN NOT NULL DEFAULT false;
