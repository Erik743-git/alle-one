-- Bloqueio temporario de login apos tentativas seguidas com senha errada.
--
-- O limite por IP nao resolve sozinho: um atacante distribuido usa IPs
-- diferentes contra a mesma conta, e o throttle em memoria ainda e por
-- processo (o PM2 roda em cluster).
--
-- Colunas nullable e com default para nao exigir backfill: conta existente
-- comeca com 0 tentativas e sem bloqueio.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "failed_login_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "locked_until" TIMESTAMP(3);
