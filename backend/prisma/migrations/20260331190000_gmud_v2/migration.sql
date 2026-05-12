-- AlterEnum
BEGIN;
CREATE TYPE "GmudStatus_new" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_EXECUTION', 'EXECUTED', 'REJECTED', 'CANCELED');
ALTER TABLE "public"."gmud" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "gmud" ALTER COLUMN "status" TYPE "GmudStatus_new" USING ("status"::text::"GmudStatus_new");
ALTER TYPE "GmudStatus" RENAME TO "GmudStatus_old";
ALTER TYPE "GmudStatus_new" RENAME TO "GmudStatus";
DROP TYPE "public"."GmudStatus_old";
ALTER TABLE "gmud" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- AlterTable
ALTER TABLE "gmud" DROP COLUMN "adverse_effects",
DROP COLUMN "affected_items",
DROP COLUMN "estimated_time",
DROP COLUMN "execution_at",
DROP COLUMN "executor",
DROP COLUMN "expected_result",
DROP COLUMN "organization",
DROP COLUMN "potential_benefits",
DROP COLUMN "project_name",
DROP COLUMN "proposed_change",
ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "code" SERIAL NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "downtime" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "downtime_end" TIMESTAMP(3),
ADD COLUMN     "downtime_start" TIMESTAMP(3),
ADD COLUMN     "executed_at" TIMESTAMP(3),
ADD COLUMN     "execution_started_at" TIMESTAMP(3),
ADD COLUMN     "impact" TEXT,
ADD COLUMN     "responsible_id" TEXT,
ADD COLUMN     "rollback" TEXT,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "title" TEXT NOT NULL,
ALTER COLUMN "reason" DROP NOT NULL;

-- AlterTable
ALTER TABLE "gmud_approvers" DROP COLUMN "approver_email",
DROP COLUMN "approver_name",
ADD COLUMN     "decision_note" TEXT,
ADD COLUMN     "user_id" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "gmud_executors" (
    "id" TEXT NOT NULL,
    "gmud_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gmud_executors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gmud_activities" (
    "id" TEXT NOT NULL,
    "gmud_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "executor_user_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "gmud_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gmud_attachments" (
    "id" TEXT NOT NULL,
    "gmud_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gmud_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gmud_executors_gmud_id_idx" ON "gmud_executors"("gmud_id");

-- CreateIndex
CREATE INDEX "gmud_executors_user_id_idx" ON "gmud_executors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "gmud_executors_gmud_id_user_id_key" ON "gmud_executors"("gmud_id", "user_id");

-- CreateIndex
CREATE INDEX "gmud_activities_gmud_id_idx" ON "gmud_activities"("gmud_id");

-- CreateIndex
CREATE INDEX "gmud_activities_executor_user_id_idx" ON "gmud_activities"("executor_user_id");

-- CreateIndex
CREATE INDEX "gmud_attachments_gmud_id_idx" ON "gmud_attachments"("gmud_id");

-- CreateIndex
CREATE INDEX "gmud_attachments_file_id_idx" ON "gmud_attachments"("file_id");

-- CreateIndex
CREATE INDEX "gmud_attachments_uploaded_by_idx" ON "gmud_attachments"("uploaded_by");

-- CreateIndex
CREATE UNIQUE INDEX "gmud_code_key" ON "gmud"("code");

-- CreateIndex
CREATE INDEX "gmud_status_idx" ON "gmud"("status");

-- CreateIndex
CREATE INDEX "gmud_responsible_id_idx" ON "gmud"("responsible_id");

-- CreateIndex
CREATE INDEX "gmud_approvers_user_id_idx" ON "gmud_approvers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "gmud_approvers_gmud_id_user_id_key" ON "gmud_approvers"("gmud_id", "user_id");

-- AddForeignKey
ALTER TABLE "gmud" ADD CONSTRAINT "gmud_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gmud_executors" ADD CONSTRAINT "gmud_executors_gmud_id_fkey" FOREIGN KEY ("gmud_id") REFERENCES "gmud"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gmud_executors" ADD CONSTRAINT "gmud_executors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gmud_approvers" ADD CONSTRAINT "gmud_approvers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gmud_activities" ADD CONSTRAINT "gmud_activities_gmud_id_fkey" FOREIGN KEY ("gmud_id") REFERENCES "gmud"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gmud_activities" ADD CONSTRAINT "gmud_activities_executor_user_id_fkey" FOREIGN KEY ("executor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gmud_attachments" ADD CONSTRAINT "gmud_attachments_gmud_id_fkey" FOREIGN KEY ("gmud_id") REFERENCES "gmud"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gmud_attachments" ADD CONSTRAINT "gmud_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gmud_attachments" ADD CONSTRAINT "gmud_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

