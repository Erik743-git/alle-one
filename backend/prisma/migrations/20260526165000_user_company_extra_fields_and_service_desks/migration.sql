-- Add new company fields
ALTER TABLE "companies"
ADD COLUMN "cnpj" TEXT,
ADD COLUMN "address" TEXT;

-- Add user flag
ALTER TABLE "users"
ADD COLUMN "responsible" BOOLEAN NOT NULL DEFAULT false;

-- Service desks catalog
CREATE TABLE "service_desks" (
  "id" TEXT NOT NULL,
  "external_id" INTEGER,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "service_desks_pkey" PRIMARY KEY ("id")
);

-- User x Service desk relation
CREATE TABLE "user_service_desks" (
  "user_id" TEXT NOT NULL,
  "service_desk_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_service_desks_pkey" PRIMARY KEY ("user_id", "service_desk_id")
);

CREATE UNIQUE INDEX "companies_cnpj_key" ON "companies"("cnpj");
CREATE UNIQUE INDEX "service_desks_external_id_key" ON "service_desks"("external_id");
CREATE UNIQUE INDEX "service_desks_name_key" ON "service_desks"("name");
CREATE INDEX "user_service_desks_service_desk_id_idx" ON "user_service_desks"("service_desk_id");

ALTER TABLE "user_service_desks"
ADD CONSTRAINT "user_service_desks_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_service_desks"
ADD CONSTRAINT "user_service_desks_service_desk_id_fkey"
FOREIGN KEY ("service_desk_id") REFERENCES "service_desks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
