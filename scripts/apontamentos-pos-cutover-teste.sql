-- =============================================================================
-- Apontamentos pós-cutover TiFlux → portal_teste
-- Conteúdo alinhado às datas reais (commits + trabalho do dia).
-- Feedback Matheus = SOMENTE 03/08.
-- =============================================================================
-- Uso (psql):
--   psql "$DATABASE_URL_TESTE" -v ON_ERROR_STOP=1 -f scripts/apontamentos-pos-cutover-teste.sql
-- Ajuste v_ticket_number e v_user_email no bloco abaixo.
-- =============================================================================

DO $$
DECLARE
  v_ticket_number   int     := 0;  -- << INFORME O NÚMERO DO CHAMADO
  v_user_email      text    := 'erik.manarin@alletecnologia.com'; -- << e-mail do colaborador
  v_user_id         text;
  v_attendance      text    := 'Remote';
BEGIN
  IF v_ticket_number IS NULL OR v_ticket_number <= 0 THEN
    RAISE EXCEPTION 'Defina v_ticket_number com o número do chamado.';
  END IF;

  SELECT id INTO v_user_id
  FROM users
  WHERE lower(email) = lower(v_user_email)
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado: %', v_user_email;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM portal_tickets WHERE ticket_number = v_ticket_number
  ) THEN
    RAISE EXCEPTION 'Ticket % não existe em portal_tickets.', v_ticket_number;
  END IF;

  DELETE FROM portal_ticket_appointments
  WHERE ticket_number = v_ticket_number
    AND created_by = v_user_id
    AND appointment_date BETWEEN DATE '2026-07-29' AND DATE '2026-08-03'
    AND description LIKE '\[ALLEONE\]%';

  --------------------------------------------------------------------------
  -- 29/07 (qua) — 2h  HORA NORMAL  14:00–16:00
  --------------------------------------------------------------------------
  INSERT INTO portal_ticket_appointments (
    id, ticket_number, appointment_date, init_time, end_time,
    description, service_name, attendance, sync_status, created_by, created_at, updated_at
  ) VALUES (
    gen_random_uuid()::text,
    v_ticket_number,
    DATE '2026-07-29',
    '14:00',
    '16:00',
    $d$[ALLEONE] Pós-cutover: revisão do portal-only, checagem de flags/ambiente de teste e o que ainda restava expor “TiFlux” ao usuário final.$d$,
    'HORA NORMAL',
    v_attendance,
    'PORTAL_ONLY',
    v_user_id,
    now(),
    now()
  );

  --------------------------------------------------------------------------
  -- 30/07 (qui) — 8h  HORA NORMAL  08:30–12:00 + 12:30–17:00
  -- Commits: clone portal_teste, strip schema=, HE/restore, overlap, data DD/MM
  --------------------------------------------------------------------------
  INSERT INTO portal_ticket_appointments (
    id, ticket_number, appointment_date, init_time, end_time,
    description, service_name, attendance, sync_status, created_by, created_at, updated_at
  ) VALUES
  (
    gen_random_uuid()::text,
    v_ticket_number,
    DATE '2026-07-30',
    '08:30',
    '12:00',
    $d$[ALLEONE] Clone data-only portal → portal_teste preservando schema; correção do strip schema= no DATABASE_URL (backup e clone); base de teste estável para validar o cutover sem misturar produção.$d$,
    'HORA NORMAL',
    v_attendance,
    'PORTAL_ONLY',
    v_user_id,
    now(),
    now()
  ),
  (
    gen_random_uuid()::text,
    v_ticket_number,
    DATE '2026-07-30',
    '12:30',
    '17:00',
    $d$[ALLEONE] HE estável por mês do calendário + restore de dump local no teste; bloqueio de apontamentos sobrepostos no mesmo ticket e validação de dump gzip no restore; data do apontamento no ticket em DD/MM/YYYY.$d$,
    'HORA NORMAL',
    v_attendance,
    'PORTAL_ONLY',
    v_user_id,
    now(),
    now()
  );

  --------------------------------------------------------------------------
  -- 31/07 (sex) — 2h30  HORA NORMAL  09:00–11:30
  -- Commits de tickets/2FA (parte principal do dia)
  --------------------------------------------------------------------------
  INSERT INTO portal_ticket_appointments (
    id, ticket_number, appointment_date, init_time, end_time,
    description, service_name, attendance, sync_status, created_by, created_at, updated_at
  ) VALUES (
    gen_random_uuid()::text,
    v_ticket_number,
    DATE '2026-07-31',
    '09:00',
    '11:30',
    $d$[ALLEONE] Tickets: “salvar e outro/fechar”, campos obrigatórios visíveis e solicitantes saneados; collab/PJ cria e aponta; responsáveis pelo checkbox; UX padrão; trust 2FA de 14 dias (cookie + localStorage).$d$,
    'HORA NORMAL',
    v_attendance,
    'PORTAL_ONLY',
    v_user_id,
    now(),
    now()
  );

  --------------------------------------------------------------------------
  -- 01/08 (sáb) — 2h30  HORA EXTRA  09:00–11:30
  --------------------------------------------------------------------------
  INSERT INTO portal_ticket_appointments (
    id, ticket_number, appointment_date, init_time, end_time,
    description, service_name, attendance, sync_status, created_by, created_at, updated_at
  ) VALUES (
    gen_random_uuid()::text,
    v_ticket_number,
    DATE '2026-08-01',
    '09:00',
    '11:30',
    $d$[ALLEONE] [HE] Endurecimento do pipeline de teste e CI após o cutover: migrations passam a subir em banco vazio (migrate deploy confiável no ambiente de teste/CI), ESLint padronizado no pre-commit (husky) e correção do build Next no modal de apontamento (labelClassName). Resultado: menos risco de deploy quebrado e de regressão silenciosa no portal-only.$d$,
    'HORA EXTRA',
    v_attendance,
    'PORTAL_ONLY',
    v_user_id,
    now(),
    now()
  );

  --------------------------------------------------------------------------
  -- 02/08 (dom) — 2h30  HORA EXTRA  09:00–11:30
  --------------------------------------------------------------------------
  INSERT INTO portal_ticket_appointments (
    id, ticket_number, appointment_date, init_time, end_time,
    description, service_name, attendance, sync_status, created_by, created_at, updated_at
  ) VALUES (
    gen_random_uuid()::text,
    v_ticket_number,
    DATE '2026-08-02',
    '09:00',
    '11:30',
    $d$[ALLEONE] [HE] Material de alinhamento Dutex × ALLE One para reunião com o cliente: posicionamento claro (ALLE opera o chamado; DUTEX.AI fica com patrimônio/indicadores), mapa técnico entre os sistemas, fluxo sem API na primeira fase e Word institucional com marca ALLE. Entrega que reduz ruído na expectativa do cliente e antecipa as frentes de portal, e-mail e registro de atendimento.$d$,
    'HORA EXTRA',
    v_attendance,
    'PORTAL_ONLY',
    v_user_id,
    now(),
    now()
  );

  --------------------------------------------------------------------------
  -- 03/08 (seg) — 8h  HORA NORMAL  08:30–12:00 + 12:30–17:00
  -- Feedback Matheus inteiro (análise + implementação) — HOJE
  --------------------------------------------------------------------------
  INSERT INTO portal_ticket_appointments (
    id, ticket_number, appointment_date, init_time, end_time,
    description, service_name, attendance, sync_status, created_by, created_at, updated_at
  ) VALUES
  (
    gen_random_uuid()::text,
    v_ticket_number,
    DATE '2026-08-03',
    '08:30',
    '12:00',
    $d$[ALLEONE] Feedback Matheus (manhã): análise do QA de criação de chamado; prefixo do cliente no título; solicitante e e-mail obrigatórios (FE+BE); máscara/validação de telefone; remoção do alerta “sem sync TiFlux”; sanitização do fundo branco na descrição/HTML; persistência e render da largura dos prints.$d$,
    'HORA NORMAL',
    v_attendance,
    'PORTAL_ONLY',
    v_user_id,
    now(),
    now()
  ),
  (
    gen_random_uuid()::text,
    v_ticket_number,
    DATE '2026-08-03',
    '12:30',
    '17:00',
    $d$[ALLEONE] Feedback Matheus (tarde): GMUD do cliente como select da lista do portal; pessoas em cópia (portal_ticket_watchers); e-mail “chamado registrado” ao criar ticket e ao abrir pré-ticket; templates TICKET_REGISTERED / GMUD_NOTIFY na Admin → E-mail → Envio; migration email_templates + watchers; companyId no catálogo de create.$d$,
    'HORA NORMAL',
    v_attendance,
    'PORTAL_ONLY',
    v_user_id,
    now(),
    now()
  );

  RAISE NOTICE 'Apontamentos inseridos no ticket % para o usuário %',
    v_ticket_number, v_user_email;
END $$;
