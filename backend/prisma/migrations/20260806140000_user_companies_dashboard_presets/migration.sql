-- Multi-empresa (user_companies) + presets de gráfico do dashboard.

DO $$ BEGIN
  CREATE TYPE "ClientCompanyRole" AS ENUM ('CLIENT_GESTOR', 'CLIENT_MEMBER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS user_companies (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_role "ClientCompanyRole" NOT NULL,
  created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_companies_user_id_company_id_key UNIQUE (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS user_companies_company_id_idx ON user_companies(company_id);

-- Backfill a partir de users.company_id + role CLIENT_*.
INSERT INTO user_companies (id, user_id, company_id, client_role, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  u.id,
  u.company_id,
  CASE
    WHEN u.role::text = 'CLIENT_MEMBER' THEN 'CLIENT_MEMBER'::"ClientCompanyRole"
    ELSE 'CLIENT_GESTOR'::"ClientCompanyRole"
  END,
  NOW(),
  NOW()
FROM users u
WHERE u.deleted_at IS NULL
  AND u.company_id IS NOT NULL
  AND u.role::text IN ('CLIENT', 'CLIENT_GESTOR', 'CLIENT_MEMBER')
ON CONFLICT (user_id, company_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS dashboard_chart_presets (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  view_mode   VARCHAR(20) NOT NULL DEFAULT 'ALLE',
  chart_type  VARCHAR(32) NOT NULL DEFAULT 'bar',
  desk_names  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  period_days INT NOT NULL DEFAULT 30,
  created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT dashboard_chart_presets_user_company_view_key UNIQUE (user_id, company_id, view_mode)
);

CREATE INDEX IF NOT EXISTS dashboard_chart_presets_company_id_idx ON dashboard_chart_presets(company_id);
