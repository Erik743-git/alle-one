-- =============================================================================
-- Seed mini-cenário B6 — Fechamento / cobrança (base TESTE)
-- =============================================================================
-- Esperado no relatório (período cobrindo as datas abaixo):
--   B=10h, C=12h, D=-2, E=-300, a cobrar = 1000 + 300 = R$ 1.300
--
-- Uso (na VM, usuário alleone):
--   set -a; source <(grep -E '^(DATABASE_URL)=' /home/alleone/teste/backend/.env | sed 's/\r$//'); set +a
--   DBURL="${DATABASE_URL%%\?*}";  # remove ?schema=public se houver
--   psql "$DBURL" -v ON_ERROR_STOP=1 -f /home/alleone/teste/backend/scripts/seed-b6-fechamento-teste.sql
--
-- Variáveis opcionais via psql -v:
--   -v company_name="'Alle Cliente'"
--   -v user_email="'erik.manarin@alletecnologia.com'"
-- =============================================================================

DO $$
DECLARE
  v_company_name text := coalesce(nullif(current_setting('seed.company_name', true), ''), 'Alle Cliente');
  v_user_email   text := coalesce(nullif(current_setting('seed.user_email', true), ''), 'erik.manarin@alletecnologia.com');

  v_company_id   text;
  v_company_nm   text;
  v_tiflux_id    int;
  v_specialty_id text;
  v_specialty_nm text;
  v_user_id      text;
  v_user_nm      text;
  v_contract_id  text;
  v_ticket_n     int;
  v_appt1        text := gen_random_uuid()::text;
  v_appt2        text := gen_random_uuid()::text;
  v_today        date := (timezone('America/Sao_Paulo', now()))::date;
  v_d1           date := v_today - 2;
  v_d2           date := v_today - 1;
BEGIN
  -- Empresa piloto (preferência pelo nome; senão qualquer com tiflux_client_id)
  SELECT c.id, c.name, c.tiflux_client_id
    INTO v_company_id, v_company_nm, v_tiflux_id
  FROM companies c
  WHERE c.deleted_at IS NULL
    AND lower(c.name) = lower(v_company_name)
  LIMIT 1;

  IF v_company_id IS NULL THEN
    SELECT c.id, c.name, c.tiflux_client_id
      INTO v_company_id, v_company_nm, v_tiflux_id
    FROM companies c
    WHERE c.deleted_at IS NULL
      AND c.tiflux_client_id IS NOT NULL
    ORDER BY c.name
    LIMIT 1;
  END IF;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa encontrada para o seed B6.';
  END IF;

  -- Garante vínculo client_external_id (necessário para somar horas no fechamento)
  IF v_tiflux_id IS NULL THEN
    SELECT COALESCE(MAX(tiflux_client_id), 900000) + 1 INTO v_tiflux_id FROM companies;
    UPDATE companies
       SET tiflux_client_id = v_tiflux_id, updated_at = now()
     WHERE id = v_company_id;
    RAISE NOTICE 'Empresa % sem tiflux_client_id — definido para % (seed)', v_company_nm, v_tiflux_id;
  END IF;

  -- Especialidade Infra (cria se não existir)
  SELECT s.id, s.name INTO v_specialty_id, v_specialty_nm
  FROM specialties s
  WHERE s.deleted_at IS NULL
    AND (
      lower(s.name) IN ('infra', 'infraestrutura', 'infrastructure')
      OR lower(s.name) LIKE 'infra%'
    )
  ORDER BY CASE WHEN lower(s.name) = 'infraestrutura' THEN 0
                WHEN lower(s.name) = 'infra' THEN 1
                ELSE 2 END
  LIMIT 1;

  IF v_specialty_id IS NULL THEN
    v_specialty_id := gen_random_uuid()::text;
    v_specialty_nm := 'Infraestrutura';
    INSERT INTO specialties (id, name, active, created_at, updated_at)
    VALUES (v_specialty_id, v_specialty_nm, true, now(), now());
    RAISE NOTICE 'Especialidade criada: %', v_specialty_nm;
  END IF;

  -- Usuário apontador
  SELECT u.id, u.name INTO v_user_id, v_user_nm
  FROM users u
  WHERE lower(u.email) = lower(v_user_email)
    AND u.deleted_at IS NULL
  LIMIT 1;

  IF v_user_id IS NULL THEN
    SELECT u.id, u.name INTO v_user_id, v_user_nm
    FROM users u
    WHERE u.deleted_at IS NULL
      AND u.role IN ('ADMIN', 'COLLABORATOR', 'PJ')
    ORDER BY CASE WHEN u.role = 'ADMIN' THEN 0 ELSE 1 END, u.created_at
    LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum usuário staff encontrado para apontar horas.';
  END IF;

  UPDATE users
     SET specialty_id = v_specialty_id, updated_at = now()
   WHERE id = v_user_id;

  -- Soft-delete contratos seed anteriores deste título na empresa
  UPDATE contracts
     SET deleted_at = now(), updated_at = now()
   WHERE company_id = v_company_id
     AND deleted_at IS NULL
     AND title = 'B6 Seed — Infra 10h';

  v_contract_id := gen_random_uuid()::text;
  INSERT INTO contracts (
    id, company_id, title, description, status,
    monthly_hours, extra_hour_price, start_date, end_date,
    created_at, updated_at
  ) VALUES (
    v_contract_id,
    v_company_id,
    'B6 Seed — Infra 10h',
    'Mini-cenário B6: 10h / R$1000 / excedente R$150',
    'ACTIVE',
    10,
    150.00,
    date_trunc('month', v_today::timestamp) - interval '1 month',
    NULL,
    now(),
    now()
  );

  INSERT INTO contract_specialties (
    id, contract_id, specialty_id, monthly_hours, unlimited,
    contract_value, excess_hour_price, created_at, updated_at
  ) VALUES (
    gen_random_uuid()::text,
    v_contract_id,
    v_specialty_id,
    10,
    false,
    1000.00,
    150.00,
    now(),
    now()
  );

  -- Ticket da empresa (para amarrar apontamentos)
  SELECT t.ticket_number INTO v_ticket_n
  FROM portal_tickets t
  WHERE t.client_external_id = v_tiflux_id
    AND t.is_closed = false
  ORDER BY t.ticket_number DESC
  LIMIT 1;

  IF v_ticket_n IS NULL THEN
    SELECT COALESCE(MAX(ticket_number), 800000) + 1 INTO v_ticket_n FROM portal_tickets;
    INSERT INTO portal_tickets (
      id, ticket_number, title, client_name, client_external_id,
      created_by_way_of, priority_name, status_name, stage_name,
      specialty_id, is_closed, origin, created_at_source, updated_at_source,
      created_by, created_at, updated_at
    ) VALUES (
      gen_random_uuid()::text,
      v_ticket_n,
      'B6 Seed — validação fechamento',
      v_company_nm,
      v_tiflux_id,
      'Portal',
      'Média',
      'Novo',
      'Novo',
      v_specialty_id,
      false,
      'PORTAL',
      now(),
      now(),
      v_user_id,
      now(),
      now()
    );
  END IF;

  -- Remove apontamentos seed anteriores deste ticket/usuário no período
  DELETE FROM portal_ticket_appointments
   WHERE ticket_number = v_ticket_n
     AND created_by = v_user_id
     AND description LIKE 'B6 Seed%';

  -- 12h totais: 6h + 6h (08:00–14:00) nos 2 dias anteriores
  INSERT INTO portal_ticket_appointments (
    id, ticket_number, appointment_date, init_time, end_time,
    description, service_name, attendance, sync_status,
    created_by, created_at, updated_at
  ) VALUES
  (
    v_appt1, v_ticket_n, v_d1, '08:00', '14:00',
    'B6 Seed — 6h (1/2)', 'HORA NORMAL', 'Remote', 'PORTAL_ONLY',
    v_user_id, now(), now()
  ),
  (
    v_appt2, v_ticket_n, v_d2, '08:00', '14:00',
    'B6 Seed — 6h (2/2)', 'HORA NORMAL', 'Remote', 'PORTAL_ONLY',
    v_user_id, now(), now()
  );

  RAISE NOTICE '========== B6 SEED OK ==========';
  RAISE NOTICE 'Empresa: % (%)', v_company_nm, v_company_id;
  RAISE NOTICE 'tiflux_client_id: %', v_tiflux_id;
  RAISE NOTICE 'Especialidade: % (%)', v_specialty_nm, v_specialty_id;
  RAISE NOTICE 'Apontador: % (%)', v_user_nm, v_user_email;
  RAISE NOTICE 'Contrato: B6 Seed — Infra 10h (10h / R$1000 / excedente R$150)';
  RAISE NOTICE 'Ticket: #%', v_ticket_n;
  RAISE NOTICE 'Apontamentos: % e % (6h+6h=12h)', v_d1, v_d2;
  RAISE NOTICE 'Gere o relatório Fechamento cobrindo % a %', v_d1, v_today;
  RAISE NOTICE 'Esperado: B=10 C=12 D=-2 E=-300 a cobrar=1300';
END $$;
