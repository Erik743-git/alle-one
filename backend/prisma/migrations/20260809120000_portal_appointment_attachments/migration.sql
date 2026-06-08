CREATE TABLE "portal_ticket_appointment_attachments" (
    "id" TEXT NOT NULL,
    "ticket_number" INTEGER NOT NULL,
    "outbox_id" TEXT,
    "tiflux_appointment_external_id" INTEGER,
    "file_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_ticket_appointment_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "portal_ticket_appointment_attachments_ticket_number_idx"
  ON "portal_ticket_appointment_attachments"("ticket_number");

CREATE INDEX "portal_ticket_appointment_attachments_outbox_id_idx"
  ON "portal_ticket_appointment_attachments"("outbox_id");

ALTER TABLE "portal_ticket_appointment_attachments"
  ADD CONSTRAINT "portal_ticket_appointment_attachments_file_id_fkey"
  FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "portal_ticket_appointment_attachments"
  ADD CONSTRAINT "portal_ticket_appointment_attachments_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "portal_ticket_appointment_attachments"
  ADD CONSTRAINT "portal_ticket_appointment_attachments_outbox_id_fkey"
  FOREIGN KEY ("outbox_id") REFERENCES "portal_tiflux_outbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
