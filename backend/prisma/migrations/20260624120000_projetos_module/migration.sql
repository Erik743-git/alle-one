-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELED');

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "code" SERIAL NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "start_date" DATE,
    "end_date" DATE,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_activities" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "wbs_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "duration_days" INTEGER NOT NULL DEFAULT 1,
    "start_date" DATE,
    "end_date" DATE,
    "actual_duration_days" INTEGER,
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "assignee_user_id" TEXT,
    "assignee_name" TEXT,
    "is_milestone" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "project_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_activity_predecessors" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "predecessor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_activity_predecessors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE INDEX "projects_company_id_idx" ON "projects"("company_id");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE UNIQUE INDEX "project_activities_project_id_wbs_code_key" ON "project_activities"("project_id", "wbs_code");

-- CreateIndex
CREATE INDEX "project_activities_project_id_idx" ON "project_activities"("project_id");

-- CreateIndex
CREATE INDEX "project_activities_parent_id_idx" ON "project_activities"("parent_id");

-- CreateIndex
CREATE INDEX "project_activities_assignee_user_id_idx" ON "project_activities"("assignee_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_activity_predecessors_activity_id_predecessor_id_key" ON "project_activity_predecessors"("activity_id", "predecessor_id");

-- CreateIndex
CREATE INDEX "project_activity_predecessors_activity_id_idx" ON "project_activity_predecessors"("activity_id");

-- CreateIndex
CREATE INDEX "project_activity_predecessors_predecessor_id_idx" ON "project_activity_predecessors"("predecessor_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "project_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_activity_predecessors" ADD CONSTRAINT "project_activity_predecessors_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "project_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_activity_predecessors" ADD CONSTRAINT "project_activity_predecessors_predecessor_id_fkey" FOREIGN KEY ("predecessor_id") REFERENCES "project_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
