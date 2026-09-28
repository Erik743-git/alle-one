-- =============================================================================
-- Diagnóstico 2: apontamentos lançados como HORA EXTRA ou PLANTÃO da pessoa no
-- ciclo, e como estão na tela de aprovação. SÓ LEITURA.
-- Troque o nome e o período. Rodar junto com DIAG-HE-ESTEIRA.sql.
--   aprovacao = APPROVED / REJECTED / PENDING  -> decidido ou aguardando
--   aprovacao = (sem evento)                   -> ninguém abriu a agenda ainda
-- =============================================================================
WITH pessoa AS (
  SELECT id, name, role FROM users
  WHERE name ILIKE 'Marcio%' AND deleted_at IS NULL            -- << pessoa
)
SELECT p.name, p.role AS perfil,
       a.appointment_date AS dia,
       a.init_time || '-' || a.end_time AS horario,
       a.ticket_number AS chamado,
       a.service_name AS servico,
       a.created_at::date AS lancado_em,
       coalesce(
         (SELECT string_agg(e.status::text, ',')
            FROM rendimento_day_events e
           WHERE e.user_id = p.id
             AND e.deleted_at IS NULL
             AND e.event_type IN ('OVERTIME', 'PLANTAO')
             AND e.appointment_external_id =
                 coalesce(a.tiflux_appointment_external_id, abs(hashtext(a.id)))::bigint),
         '(sem evento)') AS aprovacao
FROM portal_ticket_appointments a
JOIN pessoa p ON p.id = a.created_by
WHERE a.appointment_date BETWEEN '2026-08-26' AND '2026-09-25'  -- << período
  AND (upper(coalesce(a.service_name, '')) LIKE '%EXTRA%'
       OR upper(coalesce(a.service_name, '')) LIKE '%PLANT%')
ORDER BY a.appointment_date, a.init_time;

-- Resumo dos serviços usados pela pessoa no ciclo (todos, não só HE).
WITH pessoa AS (
  SELECT id FROM users WHERE name ILIKE 'Marcio%' AND deleted_at IS NULL
)
SELECT coalesce(a.service_name, '(vazio)') AS servico, count(*) AS apontamentos
FROM portal_ticket_appointments a
JOIN pessoa p ON p.id = a.created_by
WHERE a.appointment_date BETWEEN '2026-08-26' AND '2026-09-25'
GROUP BY 1 ORDER BY 2 DESC;
