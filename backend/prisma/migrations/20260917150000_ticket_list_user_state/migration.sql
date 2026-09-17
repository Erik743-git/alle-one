-- Estado da tela de tickets por usuário (filtros, colunas, larguras...).
-- Tabela nova: nada existente muda.
CREATE TABLE IF NOT EXISTS "ticket_list_user_states" (
  "user_id" TEXT NOT NULL,
  "state" JSONB NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ticket_list_user_states_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "ticket_list_user_states_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
