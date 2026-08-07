-- Especialidade: renomeia mesas → specialties; usuário 1 especialidade;
-- classificação sob specialty; linhas de contrato por especialidade.

-- 1) Tabelas principais
ALTER TABLE IF EXISTS service_desks RENAME TO specialties;

ALTER TABLE IF EXISTS service_desk_classifications RENAME TO specialty_classifications;

DO $$ BEGIN
  ALTER TABLE specialty_classifications RENAME COLUMN service_desk_id TO specialty_id;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 2) Usuário: uma especialidade
ALTER TABLE users ADD COLUMN IF NOT EXISTS specialty_id TEXT;

UPDATE users u
SET specialty_id = sub.service_desk_id
FROM (
  SELECT DISTINCT ON (user_id) user_id, service_desk_id
  FROM user_service_desks
  ORDER BY user_id, created_at ASC
) sub
WHERE u.id = sub.user_id
  AND u.specialty_id IS NULL;

DO $$ BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_specialty_id_fkey
    FOREIGN KEY (specialty_id) REFERENCES specialties(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS users_specialty_id_idx ON users(specialty_id);

DROP TABLE IF EXISTS user_service_desks;

-- 3) Pré-ticket / e-mail inbound
DO $$ BEGIN
  ALTER TABLE pre_tickets RENAME COLUMN desk_id TO specialty_id;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE email_inbound_routes RENAME COLUMN desk_id TO specialty_id;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 4) Tickets canônicos
ALTER TABLE portal_tickets ADD COLUMN IF NOT EXISTS specialty_id TEXT;

UPDATE portal_tickets t
SET specialty_id = s.id
FROM specialties s
WHERE t.specialty_id IS NULL
  AND (
    (t.desk_external_id IS NOT NULL AND s.external_id = t.desk_external_id)
    OR (t.desk_name IS NOT NULL AND lower(s.name) = lower(t.desk_name))
  );

DO $$ BEGIN
  ALTER TABLE portal_tickets
    ADD CONSTRAINT portal_tickets_specialty_id_fkey
    FOREIGN KEY (specialty_id) REFERENCES specialties(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS portal_tickets_specialty_id_idx ON portal_tickets(specialty_id);

-- 5) Contrato × especialidade
CREATE TABLE IF NOT EXISTS contract_specialties (
  id                 TEXT PRIMARY KEY,
  contract_id        TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  specialty_id       TEXT NOT NULL REFERENCES specialties(id) ON DELETE RESTRICT,
  monthly_hours      INT NOT NULL DEFAULT 0,
  unlimited          BOOLEAN NOT NULL DEFAULT false,
  contract_value     DECIMAL(12, 2) NOT NULL DEFAULT 0,
  excess_hour_price  DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT contract_specialties_contract_id_specialty_id_key UNIQUE (contract_id, specialty_id)
);

CREATE INDEX IF NOT EXISTS contract_specialties_specialty_id_idx ON contract_specialties(specialty_id);

INSERT INTO contract_specialties (
  id, contract_id, specialty_id, monthly_hours, unlimited, contract_value, excess_hour_price, created_at, updated_at
)
SELECT
  gen_random_uuid()::text,
  c.id,
  COALESCE(sc.specialty_id, (
    SELECT s.id FROM specialties s WHERE s.deleted_at IS NULL ORDER BY s.name LIMIT 1
  )),
  c.monthly_hours,
  false,
  0,
  c.extra_hour_price,
  NOW(),
  NOW()
FROM contracts c
LEFT JOIN specialty_classifications sc ON sc.id = c.classification_id
WHERE c.deleted_at IS NULL
  AND COALESCE(sc.specialty_id, (
    SELECT s.id FROM specialties s WHERE s.deleted_at IS NULL ORDER BY s.name LIMIT 1
  )) IS NOT NULL
ON CONFLICT (contract_id, specialty_id) DO NOTHING;

-- 6) Classificação: não cria nível 3 novos (app limita); níveis 3 existentes permanecem legíveis.
