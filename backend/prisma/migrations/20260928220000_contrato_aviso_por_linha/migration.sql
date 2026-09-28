-- Aviso de contrato passa a ser por LINHA (contrato + especialidade).
-- Tabela nova para o controle de "já avisado"; contrato_avisos (por empresa)
-- fica intacta, como histórico. Só cria tabela, índice e chave estrangeira.

-- CreateTable
CREATE TABLE "contrato_aviso_linhas" (
    "contract_specialty_id" TEXT NOT NULL,
    "mes" VARCHAR(7) NOT NULL,
    "faixa" SMALLINT NOT NULL,
    "company_id" TEXT NOT NULL,
    "percentual" DECIMAL(6,1) NOT NULL,
    "horas_usadas" DECIMAL(10,2) NOT NULL,
    "horas_contratadas" DECIMAL(10,2) NOT NULL,
    "oportunidade_id" TEXT,
    "enviado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contrato_aviso_linhas_pkey" PRIMARY KEY ("contract_specialty_id","mes","faixa")
);

-- CreateIndex
CREATE INDEX "contrato_aviso_linhas_company_id_mes_idx" ON "contrato_aviso_linhas"("company_id", "mes");

-- AddForeignKey
ALTER TABLE "contrato_aviso_linhas" ADD CONSTRAINT "contrato_aviso_linhas_contract_specialty_id_fkey" FOREIGN KEY ("contract_specialty_id") REFERENCES "contract_specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
