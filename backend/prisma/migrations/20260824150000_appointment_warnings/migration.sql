-- Advertências em apontamentos + confirmação de leitura por usuário
ALTER TABLE "portal_ticket_appointments"
  ADD COLUMN IF NOT EXISTS "is_warning" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "portal_ticket_appointments_ticket_number_is_warning_idx"
  ON "portal_ticket_appointments" ("ticket_number", "is_warning");

CREATE TABLE IF NOT EXISTS "portal_ticket_appointment_warning_acks" (
  "id" TEXT NOT NULL,
  "portal_appointment_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "portal_ticket_appointment_warning_acks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "portal_ticket_appointment_warning_acks_portal_appointment_id_user_id_key"
  ON "portal_ticket_appointment_warning_acks" ("portal_appointment_id", "user_id");

CREATE INDEX IF NOT EXISTS "portal_ticket_appointment_warning_acks_user_id_idx"
  ON "portal_ticket_appointment_warning_acks" ("user_id");

ALTER TABLE "portal_ticket_appointment_warning_acks"
  ADD CONSTRAINT "portal_ticket_appointment_warning_acks_portal_appointment_id_fkey"
  FOREIGN KEY ("portal_appointment_id") REFERENCES "portal_ticket_appointments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "portal_ticket_appointment_warning_acks"
  ADD CONSTRAINT "portal_ticket_appointment_warning_acks_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
