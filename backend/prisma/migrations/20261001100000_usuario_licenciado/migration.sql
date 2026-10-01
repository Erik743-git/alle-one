-- Licenciamento de usuário de cliente: sem licença, no máximo 2 apontamentos
-- de horas por chamado. Começa todo mundo sem licença; o admin marca.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "licensed" BOOLEAN NOT NULL DEFAULT false;
