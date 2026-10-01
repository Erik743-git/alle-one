-- Horas do contrato no mês, por especialidade (só leitura).
-- Busca o contrato pelo nome (parte do título ou da empresa) e mostra, para
-- cada linha do contrato, as horas apontadas no mês contra as contratadas.
--
--   sudo -u postgres psql -d portal -P pager=off \
--     -v contrato='infostore' -v mes='2026-09' -f HORAS-CONTRATO-MES.sql
--
-- Conta: apontamentos de horas (comunicação de 0 min fora) em chamados da
-- empresa do contrato com a especialidade da linha, com data no mês.
-- Inclui hora normal, extra e plantão (mesma regra do aviso e da trava).

\set ON_ERROR_STOP on
BEGIN;
SET TRANSACTION READ ONLY;

WITH params AS (
  SELECT ('%' || :'contrato' || '%')::text            AS busca,
         to_date(:'mes' || '-01', 'YYYY-MM-DD')       AS inicio,
         (to_date(:'mes' || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date AS fim
),
linhas AS (
  SELECT c.id AS contrato_id, c.title AS contrato, co.name AS empresa,
         co.tiflux_client_id, cs.specialty_id, s.name AS especialidade,
         cs.monthly_hours, cs.unlimited, c.lock_on_exhausted AS trava
    FROM contracts c
    JOIN companies co ON co.id = c.company_id
    JOIN contract_specialties cs ON cs.contract_id = c.id
    JOIN specialties s ON s.id = cs.specialty_id, params p
   WHERE c.deleted_at IS NULL
     AND (c.title ILIKE p.busca OR co.name ILIKE p.busca)
),
minutos AS (
  SELECT l.contrato_id, l.specialty_id,
         sum(
           CASE WHEN a.end_time::time >= a.init_time::time
                THEN extract(epoch FROM (a.end_time::time - a.init_time::time)) / 60
                ELSE extract(epoch FROM (a.end_time::time + interval '24 hours' - a.init_time::time)) / 60
           END)::int AS min,
         count(*) AS apontamentos,
         count(DISTINCT a.ticket_number) AS chamados
    FROM linhas l
    JOIN portal_tickets t
      ON t.client_external_id = l.tiflux_client_id
     AND t.specialty_id = l.specialty_id
    JOIN portal_ticket_appointments a ON a.ticket_number = t.ticket_number, params p
   WHERE a.appointment_date BETWEEN p.inicio AND p.fim
     AND btrim(a.init_time) <> btrim(a.end_time)
   GROUP BY l.contrato_id, l.specialty_id
)
SELECT l.empresa, l.contrato, l.especialidade,
       CASE WHEN l.unlimited THEN 'ilimitada' ELSE l.monthly_hours || 'h' END AS contratadas,
       to_char(coalesce(m.min, 0) / 60, 'FM999990') || 'h' ||
         lpad((coalesce(m.min, 0) % 60)::text, 2, '0')                  AS usadas,
       CASE WHEN l.unlimited OR l.monthly_hours = 0 THEN NULL
            ELSE round(coalesce(m.min, 0) / 60.0 / l.monthly_hours * 100, 1) END AS pct,
       coalesce(m.apontamentos, 0) AS apontamentos,
       coalesce(m.chamados, 0)     AS chamados,
       l.trava
  FROM linhas l
  LEFT JOIN minutos m ON m.contrato_id = l.contrato_id AND m.specialty_id = l.specialty_id
 ORDER BY l.empresa, l.contrato, l.especialidade;

-- Total do contrato no mês (todas as especialidades).
WITH params AS (
  SELECT ('%' || :'contrato' || '%')::text AS busca,
         to_date(:'mes' || '-01', 'YYYY-MM-DD') AS inicio,
         (to_date(:'mes' || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date AS fim
)
SELECT co.name AS empresa, c.title AS contrato,
       sum(cs.monthly_hours) FILTER (WHERE NOT cs.unlimited) || 'h' AS contratadas_total,
       (SELECT to_char(coalesce(sum(m.min), 0) / 60, 'FM999990') || 'h' ||
               lpad((coalesce(sum(m.min), 0) % 60)::text, 2, '0')
          FROM (SELECT (CASE WHEN a.end_time::time >= a.init_time::time
                      THEN extract(epoch FROM (a.end_time::time - a.init_time::time)) / 60
                      ELSE extract(epoch FROM (a.end_time::time + interval '24 hours' - a.init_time::time)) / 60
                 END)::int AS min
          FROM portal_tickets t
          JOIN portal_ticket_appointments a ON a.ticket_number = t.ticket_number
         WHERE t.client_external_id = co.tiflux_client_id
           AND t.specialty_id IN (SELECT specialty_id FROM contract_specialties WHERE contract_id = c.id)
           AND a.appointment_date BETWEEN p.inicio AND p.fim
           AND btrim(a.init_time) <> btrim(a.end_time)) m) AS usadas_total
  FROM contracts c
  JOIN companies co ON co.id = c.company_id
  JOIN contract_specialties cs ON cs.contract_id = c.id, params p
 WHERE c.deleted_at IS NULL
   AND (c.title ILIKE p.busca OR co.name ILIKE p.busca)
 GROUP BY co.name, c.title, c.id, co.tiflux_client_id, p.inicio, p.fim
 ORDER BY 1, 2;

ROLLBACK;
