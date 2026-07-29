-- Inventário: novos campos de marca, quantidade e fornecedor.
-- Idempotente: no-op se a tabela ainda não existir (CREATE vem em migration posterior).
DO $$
BEGIN
  IF to_regclass('public.inventory_assets') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE "inventory_assets"
    ADD COLUMN IF NOT EXISTS "brand" TEXT,
    ADD COLUMN IF NOT EXISTS "quantity" INTEGER,
    ADD COLUMN IF NOT EXISTS "supplier" TEXT,
    ADD COLUMN IF NOT EXISTS "supplier_third_party" BOOLEAN NOT NULL DEFAULT false;

  UPDATE "inventory_assets"
  SET "supplier" = 'Alle Tecnologia'
  WHERE "supplier" IS NULL AND "deleted_at" IS NULL;
END $$;
