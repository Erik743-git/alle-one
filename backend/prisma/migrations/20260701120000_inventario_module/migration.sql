ALTER TYPE "PermissionModule" ADD VALUE IF NOT EXISTS 'INVENTARIO';

ALTER TYPE "MailboxNotificationKind" ADD VALUE IF NOT EXISTS 'INVENTORY_EXPIRY';

CREATE TABLE IF NOT EXISTS "inventory_assets" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "unit" TEXT,
  "due_date" DATE,
  "notes" TEXT,
  "file_id" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "inventory_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_assets_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "inventory_assets_file_id_fkey"
    FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "inventory_assets_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "inventory_assets_company_id_idx"
  ON "inventory_assets"("company_id");

CREATE INDEX IF NOT EXISTS "inventory_assets_due_date_idx"
  ON "inventory_assets"("due_date");
