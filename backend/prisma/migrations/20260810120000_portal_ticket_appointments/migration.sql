CREATE TYPE "PortalTicketAppointmentSyncStatus" AS ENUM (
  'PENDING_TIFLUX',
  'SYNCED',
  'PORTAL_ONLY'
);

CREATE TABLE "portal_ticket_appointments" (
    "id" TEXT NOT NULL,
    "ticket_number" INTEGER NOT NULL,
    "appointment_date" DATE NOT NULL,
    "init_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "description" TEXT NOT NULL,
    "service_name" VARCHAR(120) NOT NULL,
    "attendance" VARCHAR(20) NOT NULL,
    "tiflux_appointment_external_id" INTEGER,
    "sync_status" "PortalTicketAppointmentSyncStatus" NOT NULL DEFAULT 'PENDING_TIFLUX',
    "outbox_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_ticket_appointments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "portal_ticket_appointments_ticket_number_idx"
  ON "portal_ticket_appointments"("ticket_number");

CREATE INDEX "portal_ticket_appointments_tiflux_external_id_idx"
  ON "portal_ticket_appointments"("tiflux_appointment_external_id");

ALTER TABLE "portal_ticket_appointments"
  ADD CONSTRAINT "portal_ticket_appointments_outbox_id_fkey"
  FOREIGN KEY ("outbox_id") REFERENCES "portal_tiflux_outbox"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "portal_ticket_appointments"
  ADD CONSTRAINT "portal_ticket_appointments_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "portal_ticket_appointment_attachments"
  ADD COLUMN "portal_appointment_id" TEXT;

CREATE INDEX "portal_ticket_appointment_attachments_portal_appointment_id_idx"
  ON "portal_ticket_appointment_attachments"("portal_appointment_id");

ALTER TABLE "portal_ticket_appointment_attachments"
  ADD CONSTRAINT "portal_ticket_appointment_attachments_portal_appointment_id_fkey"
  FOREIGN KEY ("portal_appointment_id") REFERENCES "portal_ticket_appointments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
