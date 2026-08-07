-- Corrige stage_name com encoding quebrado (ex.: "Em execu??o") na base de TESTE.
-- Rodar no banco portal_teste (ou o DB apontado pelo .env de /home/alleone/teste).

BEGIN;

-- Conferir quantos estão ruins
SELECT stage_name, COUNT(*) AS qtd
FROM portal_tickets
WHERE stage_name ~* 'em execu'
  AND stage_name IS DISTINCT FROM 'Em execução'
GROUP BY stage_name;

UPDATE portal_tickets
SET stage_name = 'Em execução',
    updated_at = NOW()
WHERE stage_name ~* '^em execu'
  AND stage_name IS DISTINCT FROM 'Em execução';

-- Se existir espelho legado:
UPDATE tiflux_tickets
SET stage_name = 'Em execução',
    updated_at = NOW()
WHERE stage_name ~* '^em execu'
  AND stage_name IS DISTINCT FROM 'Em execução';

COMMIT;

SELECT stage_name, COUNT(*) AS qtd
FROM portal_tickets
WHERE stage_name ~* 'execu'
GROUP BY stage_name
ORDER BY qtd DESC;
