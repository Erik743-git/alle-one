-- Inventário: novos campos de marca, quantidade e fornecedor
ALTER TABLE "inventory_assets"
  ADD COLUMN "brand" TEXT,
  ADD COLUMN "quantity" INTEGER,
  ADD COLUMN "supplier" TEXT,
  ADD COLUMN "supplier_third_party" BOOLEAN NOT NULL DEFAULT false;

-- Ativos já existentes passam a ter o fornecedor padrão "Alle Tecnologia"
UPDATE "inventory_assets"
SET "supplier" = 'Alle Tecnologia'
WHERE "supplier" IS NULL AND "deleted_at" IS NULL;
