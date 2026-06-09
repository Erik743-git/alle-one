-- Classificação opcional no contrato (hierarquia cadastrada em Admin > Classificação)
ALTER TABLE "contracts" ADD COLUMN "classification_id" TEXT;

CREATE INDEX "contracts_classification_id_idx" ON "contracts"("classification_id");

ALTER TABLE "contracts" ADD CONSTRAINT "contracts_classification_id_fkey"
  FOREIGN KEY ("classification_id") REFERENCES "service_desk_classifications"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
