-- Semeia o roteiro de validação de HE / Folha no banco de TESTE (portal_teste).
-- NUNCA rodar em produção: o script aborta se o banco não for portal_teste.
--
-- Uso (na VM):
--   sudo -u postgres psql -d portal_teste -v email='seu.email@alletecnologia.com' \
--     -f SEMEAR-ROTEIRO-HE-TESTE.sql
--
-- Cria 10 apontamentos PORTAL_ONLY (não sincronizam com o TiFlux) para o usuário
-- informado, num chamado da "Alle Cliente Demonstração". Pode rodar de novo: apaga
-- antes só os apontamentos marcados com [ROTEIRO-HE].
--
-- Depois disso, as ações de esteira são feitas pela TELA (é isso que se testa):
--   B, E, F, G1, G2 → aprovar | C → negar | D → deixar pendente
--   E → editar para Hora normal | F → excluir o apontamento
--
-- Esperado — relatório modo Folha, início em setembro (26/08–25/09):
--   Horas normais 5h00 | HE aprovada a pagar 5h00 | HE pendente 1h00 | HE negada 1h30
-- Mês civil de setembro: Horas normais 6h00 (HE igual).

\set ON_ERROR_STOP on
SELECT set_config('roteiro.email', :'email', false);

BEGIN;

DO $$
DECLARE
  v_email  text := current_setting('roteiro.email');
  v_user   text;
  v_ticket int;
BEGIN
  IF current_database() <> 'portal_teste' THEN
    RAISE EXCEPTION 'Abortado: banco % não é portal_teste.', current_database();
  END IF;

  SELECT id INTO v_user FROM users WHERE lower(email) = lower(v_email) AND deleted_at IS NULL;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuário % não encontrado.', v_email;
  END IF;

  SELECT ticket_number INTO v_ticket
    FROM portal_tickets
   WHERE client_name ILIKE '%demonstra%'
   ORDER BY ticket_number DESC
   LIMIT 1;
  IF v_ticket IS NULL THEN
    RAISE EXCEPTION 'Nenhum chamado da Alle Cliente Demonstração. Crie um pela tela e rode de novo.';
  END IF;

  DELETE FROM portal_ticket_appointments
   WHERE created_by = v_user AND description LIKE '[ROTEIRO-HE]%';

  INSERT INTO portal_ticket_appointments
    (id, ticket_number, appointment_date, init_time, end_time, description,
     service_name, attendance, sync_status, created_by, created_at, updated_at)
  SELECT gen_random_uuid()::text, v_ticket, d::date, i, e, '[ROTEIRO-HE] ' || k,
         s, 'Remote', 'PORTAL_ONLY', v_user, now(), now()
    FROM (VALUES
      ('A',  '2026-09-01', '09:00', '12:00', 'HORA NORMAL'),
      ('B',  '2026-09-01', '19:00', '21:00', 'HORA EXTRA'),
      ('C',  '2026-09-02', '20:00', '21:30', 'HORA EXTRA'),
      ('D',  '2026-09-03', '20:00', '21:00', 'HORA EXTRA'),
      ('E',  '2026-09-04', '19:00', '20:00', 'HORA EXTRA'),
      ('F',  '2026-09-05', '19:00', '20:30', 'HORA EXTRA'),
      ('G1', '2026-09-08', '19:00', '22:00', 'HORA EXTRA'),
      ('G2', '2026-09-08', '20:00', '21:00', 'HORA EXTRA'),
      ('H1', '2026-08-26', '09:00', '10:00', 'HORA NORMAL'),
      ('H2', '2026-09-26', '09:00', '11:00', 'HORA NORMAL')
    ) AS r(k, d, i, e, s);

  RAISE NOTICE 'OK: 10 apontamentos no chamado % para %.', v_ticket, v_email;
END $$;

COMMIT;

-- Conferência
SELECT a.description, a.appointment_date, a.init_time, a.end_time, a.service_name, a.ticket_number
  FROM portal_ticket_appointments a
  JOIN users u ON u.id = a.created_by
 WHERE lower(u.email) = lower(current_setting('roteiro.email'))
   AND a.description LIKE '[ROTEIRO-HE]%'
 ORDER BY a.appointment_date, a.init_time;

-- Ciclos fechados (se 26/08–25/09 estiver fechado, a tela vai bloquear edição/exclusão de E e F)
SELECT * FROM fechamento_ciclos ORDER BY 1 DESC LIMIT 5;
