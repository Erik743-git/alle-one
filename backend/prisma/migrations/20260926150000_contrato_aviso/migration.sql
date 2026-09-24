-- Aviso de consumo de contrato (80% e 100%). So cria tabela e valor de enum.

-- AlterEnum
ALTER TYPE "MailboxNotificationKind" ADD VALUE 'CONTRATO_CONSUMO';

-- CreateTable
CREATE TABLE "contrato_avisos" (
    "company_id" TEXT NOT NULL,
    "mes" VARCHAR(7) NOT NULL,
    "faixa" SMALLINT NOT NULL,
    "percentual" DECIMAL(6,1) NOT NULL,
    "horas_usadas" DECIMAL(10,2) NOT NULL,
    "horas_contratadas" DECIMAL(10,2) NOT NULL,
    "oportunidade_id" TEXT,
    "enviado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contrato_avisos_pkey" PRIMARY KEY ("company_id","mes","faixa")
);

-- AddForeignKey
ALTER TABLE "contrato_avisos" ADD CONSTRAINT "contrato_avisos_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
