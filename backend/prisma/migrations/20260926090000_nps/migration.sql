-- NPS por empresa e pop-up de satisfacao (docs/desenho/AVALIACAO-E-NPS.md).
-- So cria tabelas e um valor novo de enum; nada existente muda.

-- AlterEnum
ALTER TYPE "MailboxNotificationKind" ADD VALUE 'NPS_DETRATOR';

-- CreateTable
CREATE TABLE "nps_config_empresa" (
    "company_id" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "intervalo_meses" SMALLINT NOT NULL DEFAULT 3,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "nps_config_empresa_pkey" PRIMARY KEY ("company_id")
);

-- CreateTable
CREATE TABLE "nps_destinatarios" (
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nps_destinatarios_pkey" PRIMARY KEY ("company_id","user_id")
);

-- CreateTable
CREATE TABLE "nps_pesquisas" (
    "id" TEXT NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "nome" VARCHAR(255),
    "enviada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondida_em" TIMESTAMP(3),
    "nota" SMALLINT,
    "comentario" TEXT,
    "canal" VARCHAR(20),
    "dispensada_em" TIMESTAMP(3),
    "alerta_em" TIMESTAMP(3),

    CONSTRAINT "nps_pesquisas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "popup_satisfacao" (
    "user_id" TEXT NOT NULL,
    "ultimo_em" TIMESTAMP(3) NOT NULL,
    "ultimo_tipo" VARCHAR(20) NOT NULL,

    CONSTRAINT "popup_satisfacao_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "nps_destinatarios_user_id_idx" ON "nps_destinatarios"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "nps_pesquisas_token_key" ON "nps_pesquisas"("token");

-- CreateIndex
CREATE INDEX "nps_pesquisas_company_id_respondida_em_idx" ON "nps_pesquisas"("company_id", "respondida_em");

-- CreateIndex
CREATE INDEX "nps_pesquisas_user_id_respondida_em_idx" ON "nps_pesquisas"("user_id", "respondida_em");

-- CreateIndex
CREATE INDEX "nps_pesquisas_respondida_em_idx" ON "nps_pesquisas"("respondida_em");

-- AddForeignKey
ALTER TABLE "nps_config_empresa" ADD CONSTRAINT "nps_config_empresa_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nps_destinatarios" ADD CONSTRAINT "nps_destinatarios_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nps_destinatarios" ADD CONSTRAINT "nps_destinatarios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nps_pesquisas" ADD CONSTRAINT "nps_pesquisas_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nps_pesquisas" ADD CONSTRAINT "nps_pesquisas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "popup_satisfacao" ADD CONSTRAINT "popup_satisfacao_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
