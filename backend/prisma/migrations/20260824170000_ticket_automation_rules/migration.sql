-- AlterTable
ALTER TABLE "portal_tickets" ADD COLUMN "classification_id" TEXT;

-- CreateEnum
CREATE TYPE "TicketAutomationTrigger" AS ENUM ('STAGE_CHANGE');

-- CreateTable
CREATE TABLE "ticket_automation_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "trigger" "TicketAutomationTrigger" NOT NULL DEFAULT 'STAGE_CHANGE',
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ticket_automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_automation_runs" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "ticket_number" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portal_tickets_classification_id_idx" ON "portal_tickets"("classification_id");

-- CreateIndex
CREATE INDEX "ticket_automation_rules_active_deleted_at_idx" ON "ticket_automation_rules"("active", "deleted_at");

-- CreateIndex
CREATE INDEX "ticket_automation_runs_rule_id_created_at_idx" ON "ticket_automation_runs"("rule_id", "created_at");

-- CreateIndex
CREATE INDEX "ticket_automation_runs_ticket_number_idx" ON "ticket_automation_runs"("ticket_number");

-- AddForeignKey
ALTER TABLE "portal_tickets" ADD CONSTRAINT "portal_tickets_classification_id_fkey" FOREIGN KEY ("classification_id") REFERENCES "specialty_classifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_automation_rules" ADD CONSTRAINT "ticket_automation_rules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_automation_runs" ADD CONSTRAINT "ticket_automation_runs_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "ticket_automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
