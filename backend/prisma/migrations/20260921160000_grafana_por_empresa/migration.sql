-- Token do Grafana por empresa.
-- Aditivo: colunas opcionais, empresa sem token segue como está (cai nos
-- dashboards de demonstração).
ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "grafana_token_encrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "grafana_token_hint" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "grafana_org_name" TEXT;
