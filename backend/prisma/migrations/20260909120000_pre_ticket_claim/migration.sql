-- Reserva ("assumir") de pre-ticket.
--
-- A fila e compartilhada entre todos os admins e colaboradores. Duas pessoas
-- podem abrir o mesmo e-mail sem saber uma da outra: a trava atomica na
-- abertura ja impede o ticket duplicado, mas nao evita o trabalho jogado fora
-- de duas pessoas lerem e pensarem a resposta do mesmo e-mail.
--
-- A reserva expira sozinha (claimed_at + janela), entao nao existe estado
-- travado para alguem destravar na mao.

ALTER TABLE "pre_tickets"
  ADD COLUMN IF NOT EXISTS "claimed_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "claimed_at" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "pre_tickets"
    ADD CONSTRAINT "pre_tickets_claimed_by_user_id_fkey"
    FOREIGN KEY ("claimed_by_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
