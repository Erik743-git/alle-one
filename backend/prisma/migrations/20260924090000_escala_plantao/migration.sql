-- Escala de atendimento: regra que se repete + excecao de um dia.

DO $$ BEGIN
  CREATE TYPE "EscalaExcecaoTipo" AS ENUM ('FOLGA', 'TROCA');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "escala_regras" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "specialty_id" TEXT NOT NULL,
    -- "HH:MM". Fim <= inicio = turno cruza a meia-noite e pertence ao dia
    -- em que comeca.
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    -- 0 = domingo ... 6 = sabado.
    "days_of_week" INTEGER[],
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "escala_regras_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "escala_regras_deleted_at_idx" ON "escala_regras"("deleted_at");
CREATE INDEX IF NOT EXISTS "escala_regras_user_id_idx" ON "escala_regras"("user_id");

ALTER TABLE "escala_regras"
  ADD CONSTRAINT "escala_regras_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "escala_regras"
  ADD CONSTRAINT "escala_regras_specialty_id_fkey"
  FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "escala_excecoes" (
    "id" TEXT NOT NULL,
    "regra_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "tipo" "EscalaExcecaoTipo" NOT NULL,
    "substitute_user_id" TEXT,
    "start_time" VARCHAR(5),
    "end_time" VARCHAR(5),
    "motivo" VARCHAR(300),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "escala_excecoes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "escala_excecoes_date_idx" ON "escala_excecoes"("date");
CREATE INDEX IF NOT EXISTS "escala_excecoes_regra_id_idx" ON "escala_excecoes"("regra_id");

ALTER TABLE "escala_excecoes"
  ADD CONSTRAINT "escala_excecoes_regra_id_fkey"
  FOREIGN KEY ("regra_id") REFERENCES "escala_regras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "escala_excecoes"
  ADD CONSTRAINT "escala_excecoes_substitute_user_id_fkey"
  FOREIGN KEY ("substitute_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
