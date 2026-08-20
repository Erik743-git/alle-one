-- Valores de UserRole usados em 20260806120000 (ADD VALUE precisa de commit
-- separado antes do UPDATE que referencia o novo valor).
DO $$ BEGIN
  ALTER TYPE "UserRole" ADD VALUE 'CLIENT_GESTOR';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "UserRole" ADD VALUE 'CLIENT_MEMBER';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
