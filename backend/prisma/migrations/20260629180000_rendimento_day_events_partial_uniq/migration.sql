-- Corrige duplicatas de HE/plantão e troca UNIQUE (user_id, source_key) por índice parcial
-- (somente linhas vivas), evitando colisão 23505 quando source_key deriva após soft-delete.

BEGIN;

-- 1) Restaurar linhas decididas apagadas quando há PENDING vivo do mesmo apontamento
UPDATE rendimento_day_events decided
SET deleted_at = NULL, updated_at = NOW()
WHERE decided.event_type IN ('OVERTIME', 'PLANTAO')
  AND decided.appointment_external_id IS NOT NULL
  AND decided.status IN ('APPROVED', 'REJECTED')
  AND decided.deleted_at IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM rendimento_day_events pending
    WHERE pending.user_id = decided.user_id
      AND pending.date_ref = decided.date_ref
      AND pending.event_type = decided.event_type
      AND pending.appointment_external_id = decided.appointment_external_id
      AND pending.status = 'PENDING'
      AND pending.deleted_at IS NULL
      AND pending.id <> decided.id
  );

-- 2) Soft-delete PENDING vivas quando já existe decidida viva do mesmo apontamento
UPDATE rendimento_day_events pending
SET deleted_at = NOW(), updated_at = NOW()
WHERE pending.event_type IN ('OVERTIME', 'PLANTAO')
  AND pending.appointment_external_id IS NOT NULL
  AND pending.status = 'PENDING'
  AND pending.deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM rendimento_day_events decided
    WHERE decided.user_id = pending.user_id
      AND decided.date_ref = pending.date_ref
      AND decided.event_type = pending.event_type
      AND decided.appointment_external_id = pending.appointment_external_id
      AND decided.status IN ('APPROVED', 'REJECTED')
      AND decided.deleted_at IS NULL
      AND decided.id <> pending.id
  );

-- 3) Colapsar duplicatas vivas por (user_id, source_key) — mantém a linha de maior prioridade
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, source_key
      ORDER BY
        CASE status
          WHEN 'APPROVED' THEN 0
          WHEN 'REJECTED' THEN 1
          WHEN 'PENDING' THEN 2
          ELSE 3
        END,
        updated_at DESC
    ) AS rn
  FROM rendimento_day_events
  WHERE deleted_at IS NULL
)
UPDATE rendimento_day_events e
SET deleted_at = NOW(), updated_at = NOW()
FROM ranked r
WHERE e.id = r.id
  AND r.rn > 1;

ALTER TABLE rendimento_day_events
  DROP CONSTRAINT IF EXISTS rendimento_day_events_user_source_uniq;

CREATE UNIQUE INDEX rendimento_day_events_user_source_uniq
  ON rendimento_day_events (user_id, source_key)
  WHERE deleted_at IS NULL;

COMMIT;
