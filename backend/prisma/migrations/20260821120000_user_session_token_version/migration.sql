-- Invalida JWTs emitidos antes da troca de senha (tokenVersion no payload).
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
