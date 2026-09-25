-- ============================================================================
-- Separa um chamado do portal que a migração final do TiFlux gravou por cima.
--
-- De 01 a 15/09/2026 portal e TiFlux numeraram chamado em paralelo e os
-- contadores se cruzaram. Na migração (15-16/09) o ETL gravou o chamado do
-- TiFlux por cima do chamado do portal com o mesmo número: título, cliente,
-- estágio, responsável e solicitante trocados; descrição e apontamentos do
-- dono ficaram. Ex.: #81029, aberto pelo Yan como "Rotina Operacional Diária",
-- virou "[ROTINAS] [Elmeca] Validação Backup" e as horas dele foram contar
-- como da Elmeca.
--
-- O que este script faz com o número N:
--   * N continua sendo o chamado do TiFlux (com os apontamentos vindos de lá);
--   * o chamado do dono ganha um número NOVO, com o título, o cliente, a mesa
--     e o solicitante que ele digitou ao abrir (tirados do log de auditoria),
--     o estágio em que ele deixou, a descrição, os apontamentos que ELE fez no
--     portal, os anexos desses apontamentos, os seguidores e o histórico dele;
--   * os dois ganham uma nota no histórico explicando a separação.
--
-- MODO DE TESTE É O PADRÃO: mostra o antes e o depois e desfaz no fim.
--   psql -d portal -v numero=81029 -f separar-chamado-sobrescrito.sql
-- Para gravar de verdade, depois de conferir:
--   psql -d portal -v numero=81029 -v acao=COMMIT -f separar-chamado-sobrescrito.sql
--
-- Trava sozinho (e não grava nada) se: o chamado não nasceu no portal, não há
-- registro de abertura na auditoria, o número não existe no TiFlux, o título
-- atual é igual ao que o dono digitou (não foi sobrescrito), ou já foi
-- separado antes.
--
-- Observação: o número novo sai da sequence, e sequence não volta atrás no
-- ROLLBACK. Rodar em modo de teste "gasta" um número — fica um buraco na
-- numeração, sem outro efeito.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

\if :{?numero}
\else
  \echo 'Informe o chamado: -v numero=81029'
  \quit
\endif
\if :{?acao}
\else
  \set acao ROLLBACK
\endif

BEGIN;

CREATE TEMP TABLE _p ON COMMIT DROP AS SELECT :numero::int AS n;

-- O dono e o que ele digitou ao abrir.
CREATE TEMP TABLE _o ON COMMIT DROP AS
SELECT t.ticket_number AS n,
       t.created_by AS dono,
       u.name AS dono_nome,
       lower(u.email) AS dono_email,
       t.created_at,
       t.created_at_source,
       (l.payload->'body'->>'payload')::jsonb AS p
FROM portal_tickets t
JOIN _p ON _p.n = t.ticket_number
JOIN users u ON u.id = t.created_by
JOIN LATERAL (
  SELECT a.payload
  FROM audit_logs a
  WHERE a.user_id = t.created_by
    AND a.action = 'POST /api/tickets'
    AND a.created_at BETWEEN t.created_at - interval '10 seconds'
                         AND t.created_at + interval '10 seconds'
    AND (a.payload->'body'->>'payload') IS JSON OBJECT
  ORDER BY abs(extract(epoch FROM a.created_at - t.created_at))
  LIMIT 1
) l ON true
WHERE t.origin = 'PORTAL';

DO $$
DECLARE r record;
BEGIN
  IF (SELECT count(*) FROM _o) <> 1 THEN
    RAISE EXCEPTION 'Parei: o chamado não nasceu no portal ou não tem registro de abertura na auditoria.';
  END IF;
  SELECT o.n, o.p, t.title AS titulo_atual INTO r
  FROM _o o JOIN portal_tickets t ON t.ticket_number = o.n;
  IF NOT EXISTS (SELECT 1 FROM tiflux.tickets x WHERE x.ticket_number = r.n) THEN
    RAISE EXCEPTION 'Parei: o número % não existe no TiFlux — não houve colisão.', r.n;
  END IF;
  IF r.titulo_atual IS NOT DISTINCT FROM (r.p->>'title') THEN
    RAISE EXCEPTION 'Parei: o título atual é o mesmo que o dono digitou — o chamado % não foi sobrescrito.', r.n;
  END IF;
  IF EXISTS (SELECT 1 FROM ticket_history h
             WHERE h.ticket_number = r.n AND h.event_type = 'CHAMADO_SEPARADO') THEN
    RAISE EXCEPTION 'Parei: o chamado % já foi separado antes.', r.n;
  END IF;
END $$;

\echo ''
\echo '=============== ANTES ==============='
SELECT t.ticket_number, left(t.title, 50) AS titulo, t.client_name, t.stage_name,
       t.responsible_name, t.origin
FROM portal_tickets t JOIN _o o ON o.n = t.ticket_number;

\echo 'O que o dono digitou ao abrir:'
SELECT o.dono_nome AS dono, left(o.p->>'title', 60) AS titulo_original,
       o.p->>'clientId' AS cliente_id, o.p->>'deskId' AS mesa_id,
       o.p->>'requestorEmail' AS solicitante
FROM _o o;

-- Estágio em que o dono deixou o chamado: último STAGE_CHANGED dele.
CREATE TEMP TABLE _est ON COMMIT DROP AS
SELECT COALESCE((
  SELECT COALESCE(h.payload->>'toStageName',
                  substring(h.summary FROM 'para "([^"]+)"'))
  FROM ticket_history h, _o o
  WHERE h.ticket_number = o.n
    AND h.event_type = 'STAGE_CHANGED'
    AND h.source = 'PORTAL'
    AND lower(coalesce(h.actor_name, '')) IN (lower(o.dono_nome), o.dono_email)
  ORDER BY h.occurred_at DESC
  LIMIT 1
), 'Novo') AS estagio;

-- Número novo para o chamado do dono.
CREATE TEMP TABLE _m ON COMMIT DROP AS
SELECT nextval('portal_ticket_number_seq')::int AS m;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM portal_tickets t JOIN _m ON t.ticket_number = _m.m) THEN
    RAISE EXCEPTION 'Parei: o número novo % já existe.', (SELECT m FROM _m);
  END IF;
END $$;

-- 1) O chamado do dono, com o número novo.
INSERT INTO portal_tickets (
  id, ticket_number, title, client_name, client_external_id, created_by_way_of,
  priority_name, status_name, stage_name,
  responsible_external_id, responsible_name,
  desk_name, desk_external_id, specialty_id, classification_id,
  requestor_name, requestor_email, requestor_telephone,
  is_closed, origin, is_pre_ticket,
  created_at_source, updated_at_source, created_by, created_at, updated_at
)
SELECT
  gen_random_uuid()::text,
  m.m,
  o.p->>'title',
  (SELECT COALESCE(NULLIF(trim(c.tiflux_client_name), ''), c.name)
     FROM companies c
    WHERE c.tiflux_client_id = (o.p->>'clientId')::int AND c.deleted_at IS NULL
    LIMIT 1),
  (o.p->>'clientId')::int,
  'Portal',
  NULL,
  e.estagio,
  e.estagio,
  NULLIF(o.p->>'responsibleId', '')::int,
  COALESCE(
    (SELECT tu.name FROM tiflux.users tu
      WHERE tu.external_id = NULLIF(o.p->>'responsibleId', '')::int LIMIT 1),
    o.dono_nome),
  (SELECT s.name FROM specialties s
    WHERE s.external_id = NULLIF(o.p->>'deskId', '')::int AND s.deleted_at IS NULL LIMIT 1),
  NULLIF(o.p->>'deskId', '')::int,
  (SELECT s.id FROM specialties s
    WHERE s.external_id = NULLIF(o.p->>'deskId', '')::int AND s.deleted_at IS NULL LIMIT 1),
  NULLIF(o.p->>'classificationId', ''),
  o.p->>'requestorName',
  o.p->>'requestorEmail',
  NULLIF(o.p->>'requestorTelephone', ''),
  e.estagio IN ('Encerrado', 'Cancelado'),
  'PORTAL',
  false,
  o.created_at_source,
  now(),
  o.dono,
  o.created_at,
  now()
FROM _o o, _m m, _est e;

-- 2) Os apontamentos que o DONO fez no portal.
CREATE TEMP TABLE _mov ON COMMIT DROP AS
SELECT a.id
FROM portal_ticket_appointments a, _o o
WHERE a.ticket_number = o.n
  AND a.tiflux_appointment_external_id IS NULL
  AND a.created_by = o.dono;

UPDATE portal_ticket_appointments a SET ticket_number = m.m, updated_at = now()
FROM _m m WHERE a.id IN (SELECT id FROM _mov);

-- 3) Anexos: os dos apontamentos movidos, e os do chamado que o dono pôs.
UPDATE portal_ticket_appointment_attachments x SET ticket_number = m.m
FROM _m m, _o o
WHERE x.ticket_number = o.n
  AND (
    x.portal_appointment_id IN (SELECT id FROM _mov)
    OR (x.portal_appointment_id IS NULL
        AND x.tiflux_appointment_external_id IS NULL
        AND x.created_by = o.dono)
  );

-- 4) A descrição (é a do dono: o ETL nunca a trocou).
UPDATE portal_ticket_descriptions d SET ticket_number = m.m
FROM _m m, _o o WHERE d.ticket_number = o.n;

-- 5) Seguidores e GMUD que o dono pôs.
UPDATE portal_ticket_watchers w SET ticket_number = m.m
FROM _m m, _o o WHERE w.ticket_number = o.n AND w.created_by = o.dono;

UPDATE portal_ticket_gmud_links g SET ticket_number = m.m, updated_at = now()
FROM _m m, _o o WHERE g.ticket_number = o.n AND g.created_by = o.dono;

-- 6) Perguntas de rendimento sobre os apontamentos movidos: vão junto, e a
--    empresa passa a ser a do chamado certo.
UPDATE rendimento_appointment_questions q
SET ticket_number = m.m,
    company_id = COALESCE(
      (SELECT c.id FROM companies c, _o o
        WHERE c.tiflux_client_id = (o.p->>'clientId')::int AND c.deleted_at IS NULL
        LIMIT 1),
      q.company_id),
    updated_at = now()
FROM _m m
WHERE q.appointment_ref IN (SELECT id FROM _mov);

-- 7) O histórico que o dono gerou no portal.
UPDATE ticket_history h SET ticket_number = m.m
FROM _m m, _o o
WHERE h.ticket_number = o.n
  AND h.source = 'PORTAL'
  AND lower(coalesce(h.actor_name, '')) IN (lower(o.dono_nome), o.dono_email);

-- 8) O número antigo passa a ser, de fato, o chamado do TiFlux.
UPDATE portal_tickets t
SET origin = 'TIFLUX',
    created_by = NULL,
    created_by_way_of = x.created_by_way_of,
    created_at_source = x.created_at_source,
    updated_at = now()
FROM tiflux.tickets x, _o o
WHERE t.ticket_number = o.n AND x.ticket_number = o.n;

-- 9) Nota nos dois, para quem abrir entender o que houve.
INSERT INTO ticket_history (id, ticket_number, event_type, summary, actor_name,
                            source, external_key, payload, occurred_at, created_at)
SELECT gen_random_uuid(), m.m, 'CHAMADO_SEPARADO',
       'Chamado recuperado: foi aberto por ' || o.dono_nome || ' como #' || o.n ||
       ' e a migração do TiFlux gravou outro chamado por cima do mesmo número. '
       || 'Título, cliente, descrição e apontamentos trazidos para cá.',
       'Correção de dados', 'PORTAL',
       'chamado_separado:' || o.n || ':' || m.m,
       jsonb_build_object('numeroAntigo', o.n, 'numeroNovo', m.m),
       now(), now()
FROM _o o, _m m
UNION ALL
SELECT gen_random_uuid(), o.n, 'CHAMADO_SEPARADO',
       'Este número também tinha um chamado aberto no portal por ' || o.dono_nome ||
       ', gravado por cima na migração do TiFlux. Ele foi separado para o #' || m.m || '.',
       'Correção de dados', 'PORTAL',
       'chamado_separado:' || o.n || ':antigo',
       jsonb_build_object('numeroAntigo', o.n, 'numeroNovo', m.m),
       now(), now()
FROM _o o, _m m;

\echo ''
\echo '=============== DEPOIS ==============='
SELECT t.ticket_number, left(t.title, 50) AS titulo, t.client_name, t.stage_name,
       t.is_closed, t.responsible_name, t.origin
FROM portal_tickets t
WHERE t.ticket_number IN ((SELECT n FROM _o), (SELECT m FROM _m))
ORDER BY t.ticket_number;

\echo 'Apontamentos em cada um:'
SELECT a.ticket_number,
       count(*) FILTER (WHERE a.tiflux_appointment_external_id IS NULL) AS feitos_no_portal,
       count(*) FILTER (WHERE a.tiflux_appointment_external_id IS NOT NULL) AS vindos_do_tiflux
FROM portal_ticket_appointments a
WHERE a.ticket_number IN ((SELECT n FROM _o), (SELECT m FROM _m))
GROUP BY 1 ORDER BY 1;

\echo 'Descricao ficou em:'
SELECT d.ticket_number FROM portal_ticket_descriptions d
WHERE d.ticket_number IN ((SELECT n FROM _o), (SELECT m FROM _m));

\echo 'CONFERIR A MAO - apontamentos feitos no portal por OUTRA pessoa, que ficaram no numero antigo:'
SELECT a.id, u.name AS quem, a.appointment_date, a.init_time, a.end_time,
       left(a.description, 50) AS descricao
FROM portal_ticket_appointments a
JOIN _o o ON a.ticket_number = o.n
LEFT JOIN users u ON u.id = a.created_by
WHERE a.tiflux_appointment_external_id IS NULL;

\echo 'CONFERIR A MAO - outras coisas que apontam para o numero antigo:'
-- Cada tabela só é consultada se existir: o script vive na branch da teste,
-- mas roda também em bancos com esquema mais antigo (em 25/09 produção ainda
-- não tinha a pesquisa de satisfação, e a conferência abortava tudo).
DO $$
DECLARE
  n int;
  c int;
  item record;
BEGIN
  SELECT o.n INTO n FROM _o o;
  FOR item IN
    SELECT * FROM (VALUES
      ('projeto', 'projects', 'ticket_number = $1'),
      ('pre-ticket', 'pre_tickets', 'ticket_number = $1 OR linked_ticket_number = $1'),
      ('pesquisa de satisfacao', 'ticket_satisfaction_surveys', 'ticket_number = $1'),
      ('seguidor de outra pessoa', 'portal_ticket_watchers', 'ticket_number = $1')
    ) AS v(rotulo, tabela, filtro)
  LOOP
    IF to_regclass('public.' || item.tabela) IS NULL THEN
      RAISE NOTICE '%: tabela nao existe neste banco', item.rotulo;
    ELSE
      EXECUTE format('SELECT count(*) FROM %I WHERE %s', item.tabela, item.filtro)
        INTO c USING n;
      RAISE NOTICE '%: %', item.rotulo, c;
    END IF;
  END LOOP;
END $$;

\echo ''
\echo 'Terminando com:' :acao
:acao;
