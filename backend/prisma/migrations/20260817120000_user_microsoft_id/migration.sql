ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "microsoft_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_microsoft_id_key" ON "users"("microsoft_id");
