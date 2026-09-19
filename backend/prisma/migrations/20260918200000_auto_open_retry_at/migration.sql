-- Nova tentativa da MESMA ocorrência: enquanto retry_at estiver no futuro, o
-- job não tenta a regra de novo. Antes, a falha avançava a data e a ocorrência
-- daquele dia era perdida sem ninguém perceber.
ALTER TABLE "ticket_auto_open_rules"
  ADD COLUMN IF NOT EXISTS "retry_at" TIMESTAMP(3);
