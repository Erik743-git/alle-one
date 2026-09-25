-- ============================================================================
-- Acerta a mesa dos chamados do TiFlux que já passaram por
-- separar-chamado-sobrescrito.sql antes de 25/09 à noite.
--
-- O ETL da migração trocou a mesa pelo nome e pelo id do TiFlux, mas não o
-- specialty_id nem a classificação — esses ficaram os do dono do chamado do
-- portal. A primeira versão do script de separação também não acertava,
-- então o número antigo virou chamado do TiFlux preso à mesa do dono.
--
-- Acha os chamados pela nota que o script deixou no histórico (nada digitado
-- à mão). Modo de teste é o padrão; para gravar: -v acao=COMMIT
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off
\if :{?acao}
\else
  \set acao ROLLBACK
\endif

BEGIN;

CREATE TEMP TABLE _alvo ON COMMIT DROP AS
SELECT t.ticket_number,
       t.desk_external_id,
       t.desk_name,
       t.specialty_id AS mesa_atual,
       (SELECT s.id FROM specialties s
         WHERE s.external_id = t.desk_external_id AND s.deleted_at IS NULL
         LIMIT 1) AS mesa_certa,
       t.classification_id
FROM portal_tickets t
WHERE t.origin = 'TIFLUX'
  AND t.ticket_number IN (
    SELECT h.ticket_number FROM ticket_history h
    WHERE h.event_type = 'CHAMADO_SEPARADO' AND h.external_key LIKE '%:antigo'
  );

\echo '=============== O QUE VAI MUDAR ==============='
SELECT a.ticket_number,
       a.desk_name AS mesa_do_tiflux,
       (SELECT name FROM specialties WHERE id = a.mesa_atual) AS mesa_gravada_hoje,
       (SELECT name FROM specialties WHERE id = a.mesa_certa) AS vai_ficar,
       a.classification_id IS NOT NULL AS tira_classificacao
FROM _alvo a
ORDER BY a.ticket_number;

UPDATE portal_tickets t
SET specialty_id = a.mesa_certa,
    classification_id = NULL,
    updated_at = now()
FROM _alvo a
WHERE t.ticket_number = a.ticket_number
  AND (t.specialty_id IS DISTINCT FROM a.mesa_certa OR t.classification_id IS NOT NULL);

\echo ''
\echo 'Terminando com:' :acao
:acao;
