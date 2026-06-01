-- Tipos de ativo globais + descrição e lembrete
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE TABLE IF NOT EXISTS "inventory_asset_types" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "inventory_asset_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_asset_types_name_key"
  ON "inventory_asset_types"("name");

ALTER TABLE "inventory_assets"
  ADD COLUMN IF NOT EXISTS "asset_type_id" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "reminder_days_before" INTEGER;

-- Tipos a partir dos nomes já cadastrados
INSERT INTO "inventory_asset_types" ("id", "name", "updated_at")
SELECT gen_random_uuid()::text, n.name, CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT trim("name") AS name
  FROM "inventory_assets"
  WHERE "deleted_at" IS NULL AND trim("name") <> ''
) n
WHERE NOT EXISTS (
  SELECT 1 FROM "inventory_asset_types" t
  WHERE lower(trim(t."name")) = lower(trim(n.name)) AND t."deleted_at" IS NULL
);

UPDATE "inventory_assets" a
SET "asset_type_id" = t."id"
FROM "inventory_asset_types" t
WHERE a."deleted_at" IS NULL
  AND a."asset_type_id" IS NULL
  AND lower(trim(t."name")) = lower(trim(a."name"))
  AND t."deleted_at" IS NULL;

-- Fallback para linhas sem tipo
INSERT INTO "inventory_asset_types" ("id", "name", "updated_at")
SELECT gen_random_uuid()::text, 'Outros', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "inventory_asset_types" WHERE lower(trim("name")) = 'outros' AND "deleted_at" IS NULL
);

UPDATE "inventory_assets"
SET "asset_type_id" = (
  SELECT "id" FROM "inventory_asset_types"
  WHERE lower(trim("name")) = 'outros' AND "deleted_at" IS NULL
  LIMIT 1
)
WHERE "deleted_at" IS NULL AND "asset_type_id" IS NULL;

UPDATE "inventory_assets"
SET "description" = COALESCE("description", "notes")
WHERE "description" IS NULL AND "notes" IS NOT NULL;

ALTER TABLE "inventory_assets"
  ALTER COLUMN "asset_type_id" SET NOT NULL;

ALTER TABLE "inventory_assets"
  ADD CONSTRAINT "inventory_assets_asset_type_id_fkey"
  FOREIGN KEY ("asset_type_id") REFERENCES "inventory_asset_types"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "inventory_assets_asset_type_id_idx"
  ON "inventory_assets"("asset_type_id");
