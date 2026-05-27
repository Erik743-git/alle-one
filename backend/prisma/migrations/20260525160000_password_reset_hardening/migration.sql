-- Hash do código passa a ser armazenado em `token` (não o código em claro).
-- Tokens antigos em texto deixam de funcionar; usuários podem solicitar novo código.
ALTER TABLE "password_reset_tokens" ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "password_reset_tokens_user_id_created_at_idx" ON "password_reset_tokens"("user_id", "created_at");
