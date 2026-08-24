-- Filtros salvos da lista de tickets (busca avançada pré-definida)

CREATE TABLE IF NOT EXISTS "ticket_list_presets" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "company_id" TEXT,
  "name" VARCHAR(120) NOT NULL,
  "color" VARCHAR(20) NOT NULL DEFAULT '#14b8a6',
  "is_public" BOOLEAN NOT NULL DEFAULT false,
  "is_pinned" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "config" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ticket_list_presets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ticket_list_presets_user_id_name_key"
  ON "ticket_list_presets"("user_id", "name");

CREATE INDEX IF NOT EXISTS "ticket_list_presets_user_pinned_idx"
  ON "ticket_list_presets"("user_id", "is_pinned", "sort_order");

CREATE INDEX IF NOT EXISTS "ticket_list_presets_public_idx"
  ON "ticket_list_presets"("is_public", "company_id");

ALTER TABLE "ticket_list_presets"
  ADD CONSTRAINT "ticket_list_presets_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_list_presets"
  ADD CONSTRAINT "ticket_list_presets_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
