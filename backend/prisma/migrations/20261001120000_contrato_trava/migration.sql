-- Trava de apontamento por contrato: ao esgotar as horas do mês de uma linha,
-- só o admin aponta em chamado da empresa com aquela especialidade.
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "lock_on_exhausted" BOOLEAN NOT NULL DEFAULT false;
