-- Portal cliente tenant: sub-papéis + pack de módulos por empresa.
-- Depende de 20260806110000_user_role_client_gestor_member (ADD VALUE).

UPDATE users
SET role = 'CLIENT_GESTOR'
WHERE role = 'CLIENT';

CREATE TABLE IF NOT EXISTS company_modules (
  id         TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  module     "PermissionModule" NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT company_modules_company_id_module_key UNIQUE (company_id, module)
);

CREATE INDEX IF NOT EXISTS company_modules_company_id_idx ON company_modules(company_id);

INSERT INTO company_modules (id, company_id, module, enabled, created_at, updated_at)
SELECT gen_random_uuid()::text, c.id, m.module, true, NOW(), NOW()
FROM companies c
CROSS JOIN (
  VALUES
    ('DASHBOARD'::"PermissionModule"),
    ('FINANCIAL'::"PermissionModule"),
    ('GMUD'::"PermissionModule"),
    ('MONITORING'::"PermissionModule"),
    ('TICKETS'::"PermissionModule"),
    ('INVENTARIO'::"PermissionModule"),
    ('PROJECTS'::"PermissionModule"),
    ('RENDIMENTO'::"PermissionModule")
) AS m(module)
WHERE c.deleted_at IS NULL
ON CONFLICT (company_id, module) DO NOTHING;
