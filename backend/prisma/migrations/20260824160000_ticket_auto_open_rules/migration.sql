CREATE TYPE "TicketAutoOpenPeriodicity" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

CREATE TABLE "ticket_auto_open_rules" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "periodicity" "TicketAutoOpenPeriodicity" NOT NULL DEFAULT 'DAILY',
  "next_scheduled_date" DATE NOT NULL,
  "schedule_time" VARCHAR(5) NOT NULL,
  "desk_external_id" INTEGER NOT NULL,
  "client_external_id" INTEGER NOT NULL,
  "responsible_external_id" INTEGER,
  "priority_external_id" INTEGER,
  "services_catalogs_item_id" INTEGER,
  "classification_id" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "requestor_name" VARCHAR(255) NOT NULL,
  "requestor_email" VARCHAR(255) NOT NULL,
  "requestor_telephone" VARCHAR(50),
  "requestor_external_id" INTEGER,
  "external_gmud_ref" VARCHAR(120),
  "cc_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "parent_ticket_number" INTEGER,
  "last_run_at" TIMESTAMP(3),
  "last_ticket_number" INTEGER,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "ticket_auto_open_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ticket_auto_open_rules_active_next_scheduled_date_idx"
  ON "ticket_auto_open_rules" ("active", "next_scheduled_date");

ALTER TABLE "ticket_auto_open_rules"
  ADD CONSTRAINT "ticket_auto_open_rules_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
