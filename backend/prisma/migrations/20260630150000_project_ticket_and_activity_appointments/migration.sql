-- AlterTable
ALTER TABLE "projects" ADD COLUMN "ticket_number" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "projects_ticket_number_key" ON "projects"("ticket_number");

-- CreateIndex
CREATE INDEX "projects_ticket_number_idx" ON "projects"("ticket_number");

-- CreateTable
CREATE TABLE "project_activity_appointments" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "portal_appointment_id" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_activity_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_activity_appointments_portal_appointment_id_key" ON "project_activity_appointments"("portal_appointment_id");

-- CreateIndex
CREATE INDEX "project_activity_appointments_activity_id_idx" ON "project_activity_appointments"("activity_id");

-- AddForeignKey
ALTER TABLE "project_activity_appointments" ADD CONSTRAINT "project_activity_appointments_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "project_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FK para portal_ticket_appointments: tabela só existe a partir de 20260810120000.
-- Em DB limpo (CI) adia; em DB que já tinha a tabela, cria agora.
DO $$
BEGIN
  IF to_regclass('public.portal_ticket_appointments') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'project_activity_appointments_portal_appointment_id_fkey'
     ) THEN
    ALTER TABLE "project_activity_appointments"
      ADD CONSTRAINT "project_activity_appointments_portal_appointment_id_fkey"
      FOREIGN KEY ("portal_appointment_id") REFERENCES "portal_ticket_appointments"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
