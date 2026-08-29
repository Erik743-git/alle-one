-- Preenche classificação aleatória (folha válida) nas rotinas sem classificação.
-- Executar no banco de teste/produção com o usuário do DATABASE_URL, por exemplo:
--   cd ~/teste/backend && psql "$DATABASE_URL" -f prisma/scripts/backfill-ticket-auto-open-classifications.sql

BEGIN;

-- Pré-visualização (opcional)
-- SELECT r.id, r.name, r.desk_external_id, r.classification_id
-- FROM ticket_auto_open_rules r
-- WHERE r.deleted_at IS NULL
-- ORDER BY r.name;

WITH leaf AS (
  SELECT
    sc.id,
    s.external_id AS desk_external_id
  FROM specialty_classifications sc
  INNER JOIN specialties s ON s.id = sc.specialty_id
  WHERE sc.active = true
    AND s.deleted_at IS NULL
    AND s.active = true
    AND s.external_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM specialty_classifications child
      WHERE child.parent_id = sc.id
        AND child.active = true
        AND child.level <= 2
    )
),
picked AS (
  SELECT DISTINCT ON (r.id)
    r.id AS rule_id,
    l.id AS classification_id
  FROM ticket_auto_open_rules r
  INNER JOIN leaf l ON l.desk_external_id = r.desk_external_id
  WHERE r.deleted_at IS NULL
    AND r.classification_id IS NULL
  ORDER BY r.id, random()
)
UPDATE ticket_auto_open_rules AS r
SET classification_id = picked.classification_id,
    updated_at = NOW()
FROM picked
WHERE r.id = picked.rule_id;

COMMIT;

-- Conferência
SELECT
  r.name,
  r.desk_external_id,
  r.classification_id,
  sc.name AS classification_name
FROM ticket_auto_open_rules r
LEFT JOIN specialty_classifications sc ON sc.id = r.classification_id
WHERE r.deleted_at IS NULL
ORDER BY r.name;
