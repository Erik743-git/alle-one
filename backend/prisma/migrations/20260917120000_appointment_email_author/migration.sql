-- Resposta de cliente por e-mail vira comunicação do ticket.
-- Colunas só adicionadas (nullable): nenhum dado existente muda.
ALTER TABLE "portal_ticket_appointments"
  ADD COLUMN IF NOT EXISTS "external_author_name" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "external_author_email" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "source_pre_ticket_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "portal_ticket_appointments_source_pre_ticket_id_key"
  ON "portal_ticket_appointments" ("source_pre_ticket_id");
