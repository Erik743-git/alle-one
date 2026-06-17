-- Presença leve: última atividade no portal (quem está online)
ALTER TABLE "users" ADD COLUMN "last_seen_at" TIMESTAMP(3);

CREATE INDEX "users_last_seen_at_idx" ON "users"("last_seen_at");
