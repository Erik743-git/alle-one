-- Tickets canônicos do portal (cutover TiFlux). Ver docs/CUTOVER_TIFLUX.md.

CREATE TYPE "PortalTicketOrigin" AS ENUM ('TIFLUX', 'PORTAL');

CREATE TABLE "portal_tickets" (
  "id" TEXT NOT NULL,
  "ticket_number" INTEGER NOT NULL,
  "title" TEXT,
  "client_name" TEXT,
  "client_external_id" INTEGER,
  "created_by_way_of" VARCHAR(120),
  "priority_name" TEXT,
  "status_name" TEXT,
  "stage_name" TEXT,
  "responsible_external_id" INTEGER,
  "responsible_name" TEXT,
  "desk_name" TEXT,
  "desk_external_id" INTEGER,
  "requestor_name" TEXT,
  "requestor_email" TEXT,
  "requestor_telephone" TEXT,
  "is_closed" BOOLEAN NOT NULL DEFAULT false,
  "origin" "PortalTicketOrigin" NOT NULL DEFAULT 'TIFLUX',
  "created_at_source" TIMESTAMP(3),
  "updated_at_source" TIMESTAMP(3),
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "portal_tickets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "portal_tickets_ticket_number_key" ON "portal_tickets"("ticket_number");
CREATE INDEX "portal_tickets_client_external_id_idx" ON "portal_tickets"("client_external_id");
CREATE INDEX "portal_tickets_is_closed_updated_at_source_idx" ON "portal_tickets"("is_closed", "updated_at_source");
CREATE INDEX "portal_tickets_responsible_external_id_idx" ON "portal_tickets"("responsible_external_id");

ALTER TABLE "portal_tickets"
  ADD CONSTRAINT "portal_tickets_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Sequência para tickets só-portal (evita colisão com números TiFlux típicos)
CREATE SEQUENCE IF NOT EXISTS portal_ticket_number_seq START WITH 1000000000 INCREMENT BY 1;
