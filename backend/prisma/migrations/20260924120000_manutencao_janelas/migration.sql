-- Janelas de manutencao combinadas com o cliente (aba Manutencao de Agendas).
-- So cria tabela e tipo novos: nao mexe em dado existente.

DO $$ BEGIN
  CREATE TYPE "JanelaManutencaoResponsavel" AS ENUM ('ALLE', 'CLIENTE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "manutencao_janelas" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "recorrente" BOOLEAN NOT NULL,
    -- Recorrente: 0 = domingo ... 6 = sabado.
    "days_of_week" INTEGER[],
    -- Recorrente: "HH:MM". Fim <= inicio = cruza a meia-noite.
    "start_time" VARCHAR(5),
    "end_time" VARCHAR(5),
    "valid_from" DATE,
    "valid_to" DATE,
    -- Avulsa: inicio e fim com data.
    "inicio" TIMESTAMP(3),
    "fim" TIMESTAMP(3),
    "responsavel" "JanelaManutencaoResponsavel" NOT NULL,
    "observacoes" VARCHAR(2000),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "manutencao_janelas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "manutencao_janelas_company_id_deleted_at_idx"
  ON "manutencao_janelas"("company_id", "deleted_at");

DO $$ BEGIN
  ALTER TABLE "manutencao_janelas"
    ADD CONSTRAINT "manutencao_janelas_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
