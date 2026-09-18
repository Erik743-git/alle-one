-- Preferência da lista de colaboradores passa a ser de cada administrador.
-- As linhas que já existem ficam com owner_user_id nulo e seguem valendo como
-- padrão para quem ainda não configurou a própria lista.
ALTER TABLE "rendimento_collaborator_list_prefs"
  ADD COLUMN IF NOT EXISTS "id" TEXT,
  ADD COLUMN IF NOT EXISTS "owner_user_id" TEXT;

UPDATE "rendimento_collaborator_list_prefs"
  SET "id" = gen_random_uuid()::text
  WHERE "id" IS NULL;

ALTER TABLE "rendimento_collaborator_list_prefs"
  DROP CONSTRAINT IF EXISTS "rendimento_collaborator_list_prefs_pkey";

ALTER TABLE "rendimento_collaborator_list_prefs"
  ALTER COLUMN "id" SET NOT NULL,
  ADD CONSTRAINT "rendimento_collaborator_list_prefs_pkey" PRIMARY KEY ("id");

CREATE UNIQUE INDEX IF NOT EXISTS "rendimento_collaborator_list_prefs_owner_user_id_collaborat_key"
  ON "rendimento_collaborator_list_prefs" ("owner_user_id", "collaborator_user_id");

CREATE INDEX IF NOT EXISTS "rendimento_collaborator_list_prefs_collaborator_user_id_idx"
  ON "rendimento_collaborator_list_prefs" ("collaborator_user_id");

ALTER TABLE "rendimento_collaborator_list_prefs"
  ADD CONSTRAINT "rendimento_collaborator_list_prefs_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
