-- Oportunidades: quadro de cards comerciais (docs/desenho/OPORTUNIDADES.md).
-- So cria tipos, tabelas e a especialidade Comercial; nao mexe em dado existente.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "OportunidadeEstagio" AS ENUM ('PENDENTE', 'EM_ANALISE', 'PROPOSTA', 'AGUARDO_CLIENTE', 'APROVADO', 'REPROVADO', 'FECHADO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "OportunidadeTipo" AS ENUM ('PRODUTO', 'CONTRATO', 'SERVICO_AVULSO', 'PROSPECCAO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "OportunidadeOrigem" AS ENUM ('EMAIL', 'PORTAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "OportunidadeMotivoReprova" AS ENUM ('PRECO', 'CONCORRENTE', 'DESISTENCIA', 'OUTRO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "MailboxNotificationKind" ADD VALUE IF NOT EXISTS 'OPORTUNIDADE_NOVA';
ALTER TYPE "MailboxNotificationKind" ADD VALUE IF NOT EXISTS 'OPORTUNIDADE_ESTAGIO';
ALTER TYPE "MailboxNotificationKind" ADD VALUE IF NOT EXISTS 'OPORTUNIDADE_ALERTA';
ALTER TYPE "MailboxNotificationKind" ADD VALUE IF NOT EXISTS 'OPORTUNIDADE_RETORNO';

-- CreateTable
CREATE TABLE IF NOT EXISTS "oportunidades" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "estagio" "OportunidadeEstagio" NOT NULL DEFAULT 'PENDENTE',
    "estagio_anterior" "OportunidadeEstagio",
    "estagio_desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultima_movimentacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" "OportunidadeTipo",
    "origem" "OportunidadeOrigem" NOT NULL,
    "solicitante_user_id" TEXT,
    "solicitante_nome" VARCHAR(200) NOT NULL,
    "solicitante_email" VARCHAR(255),
    "company_id" TEXT,
    "cliente_nome" VARCHAR(200),
    "responsavel_user_id" TEXT,
    "valor_estimado" DECIMAL(14,2),
    "motivo_reprova" "OportunidadeMotivoReprova",
    "motivo_reprova_texto" VARCHAR(500),
    "data_retorno" DATE,
    "retorno_avisado_em" TIMESTAMP(3),
    "alerta_enviado_em" TIMESTAMP(3),
    "email_message_id" VARCHAR(500),
    "email_conversation_id" VARCHAR(500),
    "projeto_id" TEXT,
    "chamado_numero" INTEGER,
    "fechado_em" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" TEXT,

CONSTRAINT "oportunidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "oportunidade_eventos" (
    "id" TEXT NOT NULL,
    "oportunidade_id" TEXT NOT NULL,
    "tipo" VARCHAR(20) NOT NULL,
    "de" VARCHAR(200),
    "para" VARCHAR(200),
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "oportunidade_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "oportunidade_anexos" (
    "id" TEXT NOT NULL,
    "oportunidade_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "oportunidade_anexos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "oportunidade_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "caixa_email" VARCHAR(255),
    "leitura_ativa" BOOLEAN NOT NULL DEFAULT false,
    "avisar_solicitante_externo" BOOLEAN NOT NULL DEFAULT false,
    "delta_link" TEXT,
    "ultima_leitura_em" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "oportunidade_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "oportunidades_numero_key" ON "oportunidades"("numero");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "oportunidades_email_message_id_key" ON "oportunidades"("email_message_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "oportunidades_estagio_deleted_at_idx" ON "oportunidades"("estagio", "deleted_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "oportunidades_responsavel_user_id_idx" ON "oportunidades"("responsavel_user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "oportunidades_solicitante_user_id_idx" ON "oportunidades"("solicitante_user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "oportunidades_company_id_idx" ON "oportunidades"("company_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "oportunidades_email_conversation_id_idx" ON "oportunidades"("email_conversation_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "oportunidade_eventos_oportunidade_id_idx" ON "oportunidade_eventos"("oportunidade_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "oportunidade_eventos_tipo_para_created_at_idx" ON "oportunidade_eventos"("tipo", "para", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "oportunidade_anexos_oportunidade_id_idx" ON "oportunidade_anexos"("oportunidade_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_solicitante_user_id_fkey" FOREIGN KEY ("solicitante_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_responsavel_user_id_fkey" FOREIGN KEY ("responsavel_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "oportunidade_eventos" ADD CONSTRAINT "oportunidade_eventos_oportunidade_id_fkey" FOREIGN KEY ("oportunidade_id") REFERENCES "oportunidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "oportunidade_anexos" ADD CONSTRAINT "oportunidade_anexos_oportunidade_id_fkey" FOREIGN KEY ("oportunidade_id") REFERENCES "oportunidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "oportunidade_anexos" ADD CONSTRAINT "oportunidade_anexos_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Mesa Comercial: quem estiver nela administra o quadro de oportunidades.
INSERT INTO "specialties" ("id", "name", "active", "created_at", "updated_at")
VALUES (gen_random_uuid()::text, 'Comercial', true, now(), now())
ON CONFLICT ("name") DO NOTHING;
