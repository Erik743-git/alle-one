-- Preferência de gráfico por widget (CHAMADOS | HORAS | ALERTAS)
ALTER TABLE dashboard_chart_presets
  ADD COLUMN IF NOT EXISTS chart_key VARCHAR(32) NOT NULL DEFAULT 'CHAMADOS';

ALTER TABLE dashboard_chart_presets
  DROP CONSTRAINT IF EXISTS dashboard_chart_presets_user_company_view_key;

ALTER TABLE dashboard_chart_presets
  DROP CONSTRAINT IF EXISTS dashboard_chart_presets_user_id_company_id_view_mode_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dashboard_chart_presets_user_company_view_chart_key'
  ) THEN
    ALTER TABLE dashboard_chart_presets
      ADD CONSTRAINT dashboard_chart_presets_user_company_view_chart_key
      UNIQUE (user_id, company_id, view_mode, chart_key);
  END IF;
END $$;
