-- Enum UserRole: valores CLIENT_* (idempotente; rode ANTES do migrate se necessário).
-- Uso local:
--   Get-Content scripts/add-client-roles-enum.sql -Raw | docker exec -i alleone_postgres psql -U alle -d alleone

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CLIENT_GESTOR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CLIENT_MEMBER';
