-- =============================================================================
-- Diagnóstico: hora extra / plantão da esteira x apontamento de origem.
-- SÓ LEITURA. Troque o nome da pessoa e o período (ciclo da folha).
--   psql "$DATABASE_URL" -f DIAG-HE-ESTEIRA.sql
-- Coluna "situacao":
--   ok                        -> HE/plantão com apontamento válido
--   NAO E MAIS HE/PLANTAO     -> apontamento trocou de serviço; o pendente é lixo
--   APONTAMENTO MUDOU DE DIA  -> o evento ficou no dia antigo
--   SEM APONTAMENTO ...       -> apontamento apagado, ou feito direto no TiFlux
--                                (conferir na agenda antes de concluir)
-- =============================================================================
WITH pessoa AS (
  SELECT id, name FROM users
  WHERE name ILIKE 'Glaucia%' AND deleted_at IS NULL          -- << pessoa
),
ev AS (
  SELECT e.id, p.name, e.date_ref, e.event_type, e.status, e.minutes,
         to_char(e.from_time, 'HH24:MI') || '-' || to_char(e.to_time, 'HH24:MI') AS horario_evento,
         e.appointment_external_id
  FROM rendimento_day_events e
  JOIN pessoa p ON p.id = e.user_id
  WHERE e.deleted_at IS NULL
    AND e.event_type IN ('OVERTIME', 'PLANTAO')
    AND e.date_ref BETWEEN '2026-08-26' AND '2026-09-25'       -- << período
)
SELECT ev.name, ev.date_ref, ev.event_type, ev.status, ev.minutes, ev.horario_evento,
       a.ticket_number,
       a.appointment_date AS data_apontamento,
       a.init_time || '-' || a.end_time AS horario_apontamento,
       a.service_name AS servico_hoje,
       CASE
         WHEN a.id IS NULL THEN 'SEM APONTAMENTO (apagado ou do TiFlux)'
         WHEN a.appointment_date <> ev.date_ref THEN 'APONTAMENTO MUDOU DE DIA'
         WHEN upper(coalesce(a.service_name, '')) NOT LIKE '%EXTRA%'
          AND upper(coalesce(a.service_name, '')) NOT LIKE '%PLANT%' THEN 'NAO E MAIS HE/PLANTAO'
         ELSE 'ok'
       END AS situacao
FROM ev
LEFT JOIN portal_ticket_appointments a
  ON coalesce(a.tiflux_appointment_external_id, abs(hashtext(a.id)))::bigint = ev.appointment_external_id
ORDER BY ev.date_ref, ev.horario_evento;
