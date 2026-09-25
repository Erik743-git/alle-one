-- ============================================================================
-- Variante de separar-chamado-sobrescrito.sql para quando o NÚMERO tem de
-- ficar com o chamado do dono — porque alguém de fora já recebeu esse número.
--
-- Caso de origem: #81187. O Yan abriu para a Funarpen com o cliente como
-- solicitante, e o portal mandou "Seu chamado foi registrado com o número
-- 81187". A migração do TiFlux gravou por cima um monitoramento da Schnell,
-- encerrado. Se o número ficasse com a Schnell, a resposta do cliente da
-- Funarpen cairia num chamado encerrado de outro cliente e o reabriria.
--
-- O que faz com o número N:
--   * o chamado do TiFlux (como está hoje em N) é copiado para um número NOVO,
--     com a mesa certa, e leva tudo que não é do dono: apontamentos vindos do
--     TiFlux, apontamentos de outras pessoas, seus anexos, seguidores, GMUD e
--     histórico;
--   * N volta a ser o chamado do dono: título, cliente, mesa, classificação,
--     solicitante e responsável que ele digitou (auditoria), e o estágio em que
--     ele deixou (histórico). A descrição dele nunca saiu de N;
--   * nota no histórico dos dois.
--
-- Modo de teste é o padrão (termina em ROLLBACK):
--   psql -d portal -v numero=81187 -f devolver-numero-ao-dono.sql
-- Para gravar: acrescente -v acao=COMMIT
--
-- Mesmas travas do script de separação: só roda se o chamado nasceu no
-- portal, tem abertura na auditoria, existe no TiFlux, foi sobrescrito e
-- ainda não foi separado.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

\if :{?numero}
\else
  \echo 'Informe o chamado: -v numero=81187'
  \quit
\endif
\if :{?acao}
\else
  \set acao ROLLBACK
\endif

BEGIN;

CREATE TEMP TABLE _p ON COMMIT DROP AS SELECT :numero::int AS n;

CREATE TEMP TABLE _o ON COMMIT DROP AS
SELECT t.ticket_number AS n,
       t.created_by AS dono,
       u.name AS dono_nome,
       lower(u.email) AS dono_email,
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
       t.responsible_name, t.requestor_email, t.origin
FROM portal_tickets t JOIN _o o ON o.n = t.ticket_number;

\echo 'O que o dono digitou ao abrir:'
SELECT o.dono_nome AS dono, left(o.p->>'title', 60) AS titulo_original,
       o.p->>'clientId' AS cliente_id, o.p->>'requestorEmail' AS solicitante
FROM _o o;

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

-- Número novo, agora para o chamado do TiFlux.
CREATE TEMP TABLE _m ON COMMIT DROP AS
SELECT nextval('portal_ticket_number_seq')::int AS m;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM portal_tickets t JOIN _m ON t.ticket_number = _m.m) THEN
    RAISE EXCEPTION 'Parei: o número novo % já existe.', (SELECT m FROM _m);
  END IF;
END $$;

-- 1) O chamado do TiFlux, copiado de N para o número novo. A mesa sai do id
--    do TiFlux: o specialty_id de N ainda é o do dono (o ETL não o trocou).
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
  gen_random_uuid()::text, m.m, t.title, t.client_name, t.client_external_id,
  x.created_by_way_of,
  t.priority_name, t.status_name, t.stage_name,
  t.responsible_external_id, t.responsible_name,
  t.desk_name, t.desk_external_id,
  (SELECT s.id FROM specialties s
    WHERE s.external_id = t.desk_external_id AND s.deleted_at IS NULL LIMIT 1),
  NULL,
  t.requestor_name, t.requestor_email, t.requestor_telephone,
  t.is_closed, 'TIFLUX', false,
  x.created_at_source, t.updated_at_source, NULL, now(), now()
FROM portal_tickets t, tiflux.tickets x, _o o, _m m
WHERE t.ticket_number = o.n AND x.ticket_number = o.n;

-- 2) Tudo que não é do dono vai com o chamado do TiFlux.
CREATE TEMP TABLE _mov ON COMMIT DROP AS
SELECT a.id
FROM portal_ticket_appointments a, _o o
WHERE a.ticket_number = o.n
  AND NOT (a.tiflux_appointment_external_id IS NULL AND a.created_by = o.dono);

UPDATE portal_ticket_appointments a SET ticket_number = m.m, updated_at = now()
FROM _m m WHERE a.id IN (SELECT id FROM _mov);

UPDATE portal_ticket_appointment_attachments x SET ticket_number = m.m
FROM _m m, _o o
WHERE x.ticket_number = o.n
  AND (
    x.portal_appointment_id IN (SELECT id FROM _mov)
    OR (x.portal_appointment_id IS NULL
        AND (x.tiflux_appointment_external_id IS NOT NULL
             OR x.created_by IS DISTINCT FROM o.dono))
  );

UPDATE portal_ticket_watchers w SET ticket_number = m.m
FROM _m m, _o o
WHERE w.ticket_number = o.n AND w.created_by IS DISTINCT FROM o.dono;

UPDATE portal_ticket_gmud_links g SET ticket_number = m.m, updated_at = now()
FROM _m m, _o o
WHERE g.ticket_number = o.n AND g.created_by IS DISTINCT FROM o.dono;

UPDATE rendimento_appointment_questions q
SET ticket_number = m.m,
    company_id = COALESCE(
      (SELECT c.id FROM companies c, portal_tickets t
        WHERE t.ticket_number = m.m
          AND c.tiflux_client_id = t.client_external_id AND c.deleted_at IS NULL
        LIMIT 1),
      q.company_id),
    updated_at = now()
FROM _m m
WHERE q.appointment_ref IN (SELECT id FROM _mov);

UPDATE ticket_history h SET ticket_number = m.m
FROM _m m, _o o
WHERE h.ticket_number = o.n
  AND NOT (h.source = 'PORTAL'
           AND lower(coalesce(h.actor_name, '')) IN (lower(o.dono_nome), o.dono_email));

-- 3) N volta a ser o chamado do dono. A descrição dele nunca saiu daqui.
UPDATE portal_tickets t
SET title = o.p->>'title',
    client_name = (SELECT COALESCE(NULLIF(trim(c.tiflux_client_name), ''), c.name)
                     FROM companies c
                    WHERE c.tiflux_client_id = (o.p->>'clientId')::int AND c.deleted_at IS NULL
                    LIMIT 1),
    client_external_id = (o.p->>'clientId')::int,
    created_by_way_of = 'Portal',
    priority_name = NULL,
    status_name = e.estagio,
    stage_name = e.estagio,
    responsible_external_id = NULLIF(o.p->>'responsibleId', '')::int,
    responsible_name = COALESCE(
      (SELECT tu.name FROM tiflux.users tu
        WHERE tu.external_id = NULLIF(o.p->>'responsibleId', '')::int LIMIT 1),
      o.dono_nome),
    desk_name = (SELECT s.name FROM specialties s
                  WHERE s.external_id = NULLIF(o.p->>'deskId', '')::int AND s.deleted_at IS NULL
                  LIMIT 1),
    desk_external_id = NULLIF(o.p->>'deskId', '')::int,
    specialty_id = (SELECT s.id FROM specialties s
                     WHERE s.external_id = NULLIF(o.p->>'deskId', '')::int AND s.deleted_at IS NULL
                     LIMIT 1),
    classification_id = NULLIF(o.p->>'classificationId', ''),
    requestor_name = o.p->>'requestorName',
    requestor_email = o.p->>'requestorEmail',
    requestor_telephone = NULLIF(o.p->>'requestorTelephone', ''),
    is_closed = e.estagio IN ('Encerrado', 'Cancelado'),
    updated_at_source = now(),
    updated_at = now()
FROM _o o, _est e
WHERE t.ticket_number = o.n;

-- 4) Nota nos dois.
INSERT INTO ticket_history (id, ticket_number, event_type, summary, actor_name,
                            source, external_key, payload, occurred_at, created_at)
SELECT gen_random_uuid(), o.n, 'CHAMADO_SEPARADO',
       'Chamado recuperado: a migração do TiFlux gravou outro chamado por cima deste '
       || 'número. O número ficou com este chamado porque o solicitante já o '
       || 'recebeu por e-mail; o chamado do TiFlux foi para o #' || m.m || '.',
       'Correção de dados', 'PORTAL',
       'chamado_separado:' || o.n || ':dono-fica',
       jsonb_build_object('numeroDoDono', o.n, 'numeroDoTiflux', m.m),
       now(), now()
FROM _o o, _m m
UNION ALL
SELECT gen_random_uuid(), m.m, 'CHAMADO_SEPARADO',
       'Chamado do TiFlux que tinha o mesmo número (#' || o.n || ') de um chamado '
       || 'aberto no portal por ' || o.dono_nome || '. O número ficou com o do '
       || 'portal, porque o solicitante dele já o recebeu por e-mail.',
       'Correção de dados', 'PORTAL',
       'chamado_separado:' || o.n || ':tiflux-sai',
       jsonb_build_object('numeroDoDono', o.n, 'numeroDoTiflux', m.m),
       now(), now()
FROM _o o, _m m;

\echo ''
\echo '=============== DEPOIS ==============='
SELECT t.ticket_number, left(t.title, 50) AS titulo, t.client_name, t.stage_name,
       t.is_closed, t.responsible_name, t.requestor_email, t.origin,
       (SELECT name FROM specialties WHERE id = t.specialty_id) AS mesa
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

\echo ''
\echo 'Terminando com:' :acao
:acao;
