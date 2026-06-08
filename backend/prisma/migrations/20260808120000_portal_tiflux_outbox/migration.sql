-- Outbox leve para dual-write portal → TiFlux (opção A). Catálogo continua em tiflux.*

CREATE TYPE "PortalTifluxOutboxKind" AS ENUM ('CREATE_TICKET', 'CREATE_APPOINTMENT', 'UPDATE_TICKET', 'UPDATE_APPOINTMENT');

CREATE TYPE "PortalTifluxOutboxStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

CREATE TABLE "portal_tiflux_outbox" (
    "id" TEXT NOT NULL,
    "kind" "PortalTifluxOutboxKind" NOT NULL,
    "status" "PortalTifluxOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "ticket_number" INTEGER,
    "tiflux_external_id" INTEGER,
    "payload" JSONB NOT NULL,
    "error_message" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3),

    CONSTRAINT "portal_tiflux_outbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "portal_tiflux_outbox_status_created_at_idx" ON "portal_tiflux_outbox"("status", "created_at");
CREATE INDEX "portal_tiflux_outbox_ticket_number_idx" ON "portal_tiflux_outbox"("ticket_number");

ALTER TABLE "portal_tiflux_outbox" ADD CONSTRAINT "portal_tiflux_outbox_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
