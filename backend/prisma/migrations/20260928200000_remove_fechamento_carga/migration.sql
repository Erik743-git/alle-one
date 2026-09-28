-- Fechamento do mês e Carga da equipe saíram do portal (decisão de 25/09).
-- As migrações que criaram esses módulos ficam (já rodaram na teste); esta
-- apaga o que elas criaram. Em produção nada disso existia: IF EXISTS.
DROP TABLE IF EXISTS "fechamento_eventos";
DROP TABLE IF EXISTS "fechamento_ciclos";
DELETE FROM "acesso_modulos" WHERE "chave" = 'carga-equipe';
