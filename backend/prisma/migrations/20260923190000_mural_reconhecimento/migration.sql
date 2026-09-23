-- Mural de reconhecimento entre colaboradores.

CREATE TABLE IF NOT EXISTS "mural_notes" (
    "id" TEXT NOT NULL,
    -- Gravado mesmo em bilhete anonimo: e o rastro para apurar abuso.
    -- A API nao devolve o autor quando "anonymous" e true.
    "author_user_id" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    -- Nulo = recado para o mural inteiro, sem destinatario.
    "to_user_id" TEXT,
    "message" VARCHAR(600) NOT NULL,
    "color" VARCHAR(20) NOT NULL DEFAULT 'amarelo',
    -- Posicao em fracao da parede (0 a 1), para ficar igual em qualquer tela.
    "x" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "mural_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mural_notes_deleted_at_idx" ON "mural_notes"("deleted_at");
CREATE INDEX IF NOT EXISTS "mural_notes_to_user_id_idx" ON "mural_notes"("to_user_id");
CREATE INDEX IF NOT EXISTS "mural_notes_author_user_id_idx" ON "mural_notes"("author_user_id");

ALTER TABLE "mural_notes"
  ADD CONSTRAINT "mural_notes_author_user_id_fkey"
  FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mural_notes"
  ADD CONSTRAINT "mural_notes_to_user_id_fkey"
  FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
