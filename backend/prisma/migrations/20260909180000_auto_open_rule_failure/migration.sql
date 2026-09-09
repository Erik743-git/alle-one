-- Registro de falha das regras de auto-abertura.
--
-- Ate aqui uma regra quebrada falhava em silencio: o catch so logava, a data
-- nao avancava, e ela refalhava em TODO tick do cron para sempre. O chamado
-- que deveria abrir nunca abria e ninguem era avisado — em staging isso so
-- foi descoberto lendo log.
--
-- Colunas nullable e contador com default: regra existente comeca zerada.

ALTER TABLE "ticket_auto_open_rules"
  ADD COLUMN IF NOT EXISTS "last_error" TEXT,
  ADD COLUMN IF NOT EXISTS "last_error_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "consecutive_failures" INTEGER NOT NULL DEFAULT 0;
