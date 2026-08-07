-- Pre-tickets (e-mail inbound) + 2FA TOTP fields

CREATE TYPE "PreTicketStatus" AS ENUM ('PENDING', 'OPENED', 'DELETED');

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "totp_secret_encrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "totp_enabled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "totp_backup_codes_hash" TEXT;

CREATE TABLE IF NOT EXISTS "pre_tickets" (
  "id" TEXT NOT NULL,
  "status" "PreTicketStatus" NOT NULL DEFAULT 'PENDING',
  "title" TEXT NOT NULL,
  "description_html" TEXT,
  "description_text" TEXT,
  "from_name" TEXT,
  "from_email" TEXT NOT NULL,
  "to_emails" TEXT[] NOT NULL,
  "channel" VARCHAR(40) NOT NULL DEFAULT 'E-mail',
  "mailbox_address" TEXT NOT NULL,
  "message_id" TEXT NOT NULL,
  "graph_message_id" TEXT,
  "company_id" TEXT,
  "requestor_user_id" TEXT,
  "desk_id" TEXT,
  "priority_name" VARCHAR(80),
  "attachment_count" INTEGER NOT NULL DEFAULT 0,
  "ticket_number" INTEGER,
  "opened_by_user_id" TEXT,
  "opened_at" TIMESTAMP(3),
  "deleted_at" TIMESTAMP(3),
  "received_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pre_tickets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pre_tickets_message_id_key" ON "pre_tickets"("message_id");
CREATE INDEX IF NOT EXISTS "pre_tickets_status_received_at_idx" ON "pre_tickets"("status", "received_at");
CREATE INDEX IF NOT EXISTS "pre_tickets_from_email_idx" ON "pre_tickets"("from_email");
CREATE INDEX IF NOT EXISTS "pre_tickets_mailbox_address_idx" ON "pre_tickets"("mailbox_address");

CREATE TABLE IF NOT EXISTS "pre_ticket_attachments" (
  "id" TEXT NOT NULL,
  "pre_ticket_id" TEXT NOT NULL,
  "file_id" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "content_type" TEXT,
  "size_bytes" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pre_ticket_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pre_ticket_attachments_pre_ticket_id_idx" ON "pre_ticket_attachments"("pre_ticket_id");

CREATE TABLE IF NOT EXISTS "email_inbound_routes" (
  "id" TEXT NOT NULL,
  "match_email" TEXT NOT NULL,
  "desk_id" TEXT,
  "company_id" TEXT,
  "priority_name" VARCHAR(80),
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "email_inbound_routes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "email_inbound_routes_match_email_idx" ON "email_inbound_routes"("match_email");
CREATE INDEX IF NOT EXISTS "email_inbound_routes_active_idx" ON "email_inbound_routes"("active");

CREATE TABLE IF NOT EXISTS "email_inbound_settings" (
  "id" TEXT NOT NULL,
  "shared_mailbox_address" TEXT,
  "use_as_requester" VARCHAR(40) NOT NULL DEFAULT 'Remetente',
  "graph_tenant_id" TEXT,
  "graph_client_id" TEXT,
  "graph_client_secret_enc" TEXT,
  "delta_link" TEXT,
  "last_polled_at" TIMESTAMP(3),
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_inbound_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pre_tickets"
  ADD CONSTRAINT "pre_tickets_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pre_tickets"
  ADD CONSTRAINT "pre_tickets_requestor_user_id_fkey"
  FOREIGN KEY ("requestor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pre_tickets"
  ADD CONSTRAINT "pre_tickets_opened_by_user_id_fkey"
  FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pre_tickets"
  ADD CONSTRAINT "pre_tickets_desk_id_fkey"
  FOREIGN KEY ("desk_id") REFERENCES "service_desks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pre_ticket_attachments"
  ADD CONSTRAINT "pre_ticket_attachments_pre_ticket_id_fkey"
  FOREIGN KEY ("pre_ticket_id") REFERENCES "pre_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pre_ticket_attachments"
  ADD CONSTRAINT "pre_ticket_attachments_file_id_fkey"
  FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "email_inbound_routes"
  ADD CONSTRAINT "email_inbound_routes_desk_id_fkey"
  FOREIGN KEY ("desk_id") REFERENCES "service_desks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_inbound_routes"
  ADD CONSTRAINT "email_inbound_routes_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_inbound_routes"
  ADD CONSTRAINT "email_inbound_routes_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
