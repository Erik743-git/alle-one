-- Orçamento, aprovação de conclusão e documentos do projeto

CREATE TYPE "ProjectBudgetUnit" AS ENUM ('HOURS', 'DAYS');
CREATE TYPE "ProjectCompletionApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "projects"
  ADD COLUMN "budget_unit" "ProjectBudgetUnit",
  ADD COLUMN "budget_amount" INTEGER,
  ADD COLUMN "completion_approval_status" "ProjectCompletionApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "completion_approved_by" TEXT,
  ADD COLUMN "completion_approved_at" TIMESTAMP(3),
  ADD COLUMN "completion_approval_note" TEXT;

CREATE INDEX "projects_completion_approval_status_idx" ON "projects"("completion_approval_status");

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_completion_approved_by_fkey"
  FOREIGN KEY ("completion_approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "project_documents" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "file_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_documents_project_id_idx" ON "project_documents"("project_id");
CREATE INDEX "project_documents_file_id_idx" ON "project_documents"("file_id");

ALTER TABLE "project_documents"
  ADD CONSTRAINT "project_documents_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_documents"
  ADD CONSTRAINT "project_documents_file_id_fkey"
  FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
