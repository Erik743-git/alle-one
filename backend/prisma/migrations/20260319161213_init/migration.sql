-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'COLLABORATOR', 'CLIENT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PermissionModule" AS ENUM ('DASHBOARD', 'FINANCIAL', 'GMUD', 'REPORTS', 'ADMIN', 'COMPANIES', 'USERS', 'PERMISSIONS', 'CONTRACTS', 'MONITORING', 'TICKETS', 'DOCUMENTATION', 'PROJECTS', 'SLA', 'BILLING');

-- CreateEnum
CREATE TYPE "ContractFileType" AS ENUM ('CONTRACT', 'SLA', 'ATTACHMENT');

-- CreateEnum
CREATE TYPE "GmudStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "GmudApproverStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "first_access" BOOLEAN NOT NULL DEFAULT true,
    "company_id" TEXT,
    "google_id" TEXT,
    "provider" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "responsible_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "logo_file_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "module" "PermissionModule" NOT NULL,
    "can_view" BOOLEAN NOT NULL DEFAULT false,
    "can_create" BOOLEAN NOT NULL DEFAULT false,
    "can_edit" BOOLEAN NOT NULL DEFAULT false,
    "can_delete" BOOLEAN NOT NULL DEFAULT false,
    "can_approve" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ContractStatus" NOT NULL,
    "monthly_hours" INTEGER NOT NULL,
    "extra_hour_price" DECIMAL(10,2) NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_files" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "type" "ContractFileType" NOT NULL,

    CONSTRAINT "contract_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gmud" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "project_name" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "execution_at" TIMESTAMP(3) NOT NULL,
    "executor" TEXT NOT NULL,
    "proposed_change" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expected_result" TEXT NOT NULL,
    "estimated_time" TEXT NOT NULL,
    "affected_items" TEXT NOT NULL,
    "potential_benefits" TEXT NOT NULL,
    "adverse_effects" TEXT NOT NULL,
    "status" "GmudStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "gmud_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gmud_approvers" (
    "id" TEXT NOT NULL,
    "gmud_id" TEXT NOT NULL,
    "approver_name" TEXT NOT NULL,
    "approver_email" TEXT NOT NULL,
    "status" "GmudApproverStatus" NOT NULL DEFAULT 'PENDING',
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "gmud_approvers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "generated_by" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_entries" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "month_reference" TIMESTAMP(3) NOT NULL,
    "contracted_hours" DECIMAL(10,2) NOT NULL,
    "used_hours" DECIMAL(10,2) NOT NULL,
    "extra_hours" DECIMAL(10,2) NOT NULL,
    "extra_amount" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_zabbix_hosts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "zabbix_host_id" TEXT NOT NULL,
    "host_name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "integration_zabbix_hosts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_tiflux_accounts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "tiflux_company_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "integration_tiflux_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE INDEX "users_company_id_idx" ON "users"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_logo_file_id_key" ON "companies"("logo_file_id");

-- CreateIndex
CREATE INDEX "permissions_user_id_idx" ON "permissions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_user_id_module_key" ON "permissions"("user_id", "module");

-- CreateIndex
CREATE INDEX "contracts_company_id_idx" ON "contracts"("company_id");

-- CreateIndex
CREATE INDEX "contract_files_contract_id_idx" ON "contract_files"("contract_id");

-- CreateIndex
CREATE INDEX "contract_files_file_id_idx" ON "contract_files"("file_id");

-- CreateIndex
CREATE INDEX "files_uploaded_by_idx" ON "files"("uploaded_by");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "gmud_company_id_idx" ON "gmud"("company_id");

-- CreateIndex
CREATE INDEX "gmud_created_by_idx" ON "gmud"("created_by");

-- CreateIndex
CREATE INDEX "gmud_approvers_gmud_id_idx" ON "gmud_approvers"("gmud_id");

-- CreateIndex
CREATE INDEX "reports_company_id_idx" ON "reports"("company_id");

-- CreateIndex
CREATE INDEX "reports_file_id_idx" ON "reports"("file_id");

-- CreateIndex
CREATE INDEX "billing_entries_company_id_idx" ON "billing_entries"("company_id");

-- CreateIndex
CREATE INDEX "billing_entries_contract_id_idx" ON "billing_entries"("contract_id");

-- CreateIndex
CREATE INDEX "integration_zabbix_hosts_company_id_idx" ON "integration_zabbix_hosts"("company_id");

-- CreateIndex
CREATE INDEX "integration_tiflux_accounts_company_id_idx" ON "integration_tiflux_accounts"("company_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_files" ADD CONSTRAINT "contract_files_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_files" ADD CONSTRAINT "contract_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gmud" ADD CONSTRAINT "gmud_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gmud" ADD CONSTRAINT "gmud_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gmud_approvers" ADD CONSTRAINT "gmud_approvers_gmud_id_fkey" FOREIGN KEY ("gmud_id") REFERENCES "gmud"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_entries" ADD CONSTRAINT "billing_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_entries" ADD CONSTRAINT "billing_entries_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_zabbix_hosts" ADD CONSTRAINT "integration_zabbix_hosts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_tiflux_accounts" ADD CONSTRAINT "integration_tiflux_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
