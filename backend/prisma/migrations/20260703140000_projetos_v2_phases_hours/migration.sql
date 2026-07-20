-- CreateEnum
CREATE TYPE "ProjectActivityKind" AS ENUM ('PHASE', 'TASK', 'MILESTONE');

-- CreateEnum
CREATE TYPE "ProjectActivityStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ProjectHistoryEventType" AS ENUM (
  'PROJECT_CREATED',
  'PROJECT_UPDATED',
  'PROJECT_REOPENED',
  'PROJECT_CLOSED',
  'PHASE_CREATED',
  'PHASE_UPDATED',
  'PHASE_DELETED',
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_COMPLETED',
  'TASK_DELETED',
  'APPOINTMENT_LINKED'
);

-- AlterTable
ALTER TABLE "project_activities"
  ADD COLUMN "kind" "ProjectActivityKind" NOT NULL DEFAULT 'TASK',
  ADD COLUMN "duration_hours" INTEGER,
  ADD COLUMN "actual_duration_hours" INTEGER,
  ADD COLUMN "activity_status" "ProjectActivityStatus" NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN "completed_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "project_activities_kind_idx" ON "project_activities"("kind");

-- CreateIndex
CREATE INDEX "project_activities_activity_status_idx" ON "project_activities"("activity_status");

-- Migrate existing rows
UPDATE "project_activities"
SET "kind" = 'MILESTONE',
    "duration_hours" = 0,
    "activity_status" = CASE
      WHEN "progress_percent" >= 100 THEN 'COMPLETED'::"ProjectActivityStatus"
      WHEN "progress_percent" > 0 THEN 'IN_PROGRESS'::"ProjectActivityStatus"
      ELSE 'NOT_STARTED'::"ProjectActivityStatus"
    END,
    "completed_at" = CASE WHEN "progress_percent" >= 100 THEN NOW() ELSE NULL END
WHERE "is_milestone" = true;

UPDATE "project_activities"
SET "kind" = 'PHASE',
    "duration_days" = 0,
    "duration_hours" = NULL,
    "activity_status" = CASE
      WHEN "progress_percent" >= 100 THEN 'COMPLETED'::"ProjectActivityStatus"
      WHEN "progress_percent" > 0 THEN 'IN_PROGRESS'::"ProjectActivityStatus"
      ELSE 'NOT_STARTED'::"ProjectActivityStatus"
    END
WHERE "parent_id" IS NULL
  AND "is_milestone" = false;

UPDATE "project_activities"
SET "kind" = 'TASK',
    "duration_hours" = GREATEST(0, "duration_days" * 8),
    "actual_duration_hours" = CASE
      WHEN "actual_duration_days" IS NOT NULL THEN GREATEST(0, "actual_duration_days" * 8)
      ELSE NULL
    END,
    "activity_status" = CASE
      WHEN "progress_percent" >= 100 THEN 'COMPLETED'::"ProjectActivityStatus"
      WHEN "progress_percent" > 0 THEN 'IN_PROGRESS'::"ProjectActivityStatus"
      ELSE 'NOT_STARTED'::"ProjectActivityStatus"
    END,
    "completed_at" = CASE WHEN "progress_percent" >= 100 THEN NOW() ELSE NULL END
WHERE "parent_id" IS NOT NULL
  AND "is_milestone" = false;

-- CreateTable
CREATE TABLE "project_history" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "event_type" "ProjectHistoryEventType" NOT NULL,
  "entity_type" TEXT,
  "entity_id" TEXT,
  "summary" TEXT NOT NULL,
  "payload" JSONB,
  "actor_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "project_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_history_project_id_created_at_idx" ON "project_history"("project_id", "created_at");

-- AddForeignKey
ALTER TABLE "project_history"
  ADD CONSTRAINT "project_history_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_history"
  ADD CONSTRAINT "project_history_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
