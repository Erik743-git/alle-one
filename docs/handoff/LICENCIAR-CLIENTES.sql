-- Licenciamento: quem apontou nos últimos 2 meses e licença para Fluidra e Alle.
-- Rodar DEPOIS do deploy que cria users.licensed (migração 20261001100000).
--
--   Teste:     sudo -u postgres psql -d portal_teste -P pager=off -f LICENCIAR-CLIENTES.sql
--   Produção:  sudo -u postgres psql -d portal       -P pager=off -f LICENCIAR-CLIENTES.sql
--
-- As partes 1 e 2 só leem. A parte 3 grava e termina em ROLLBACK: confira a
-- contagem e, para valer, troque ROLLBACK por COMMIT e rode de novo.

\set ON_ERROR_STOP on

-- 1) Quem apontou horas nos últimos 2 meses (comunicação de 0 min fora).
--    "chamados_acima_de_2" = em quantos chamados a pessoa passou de 2
--    apontamentos: é quem seria bloqueado sem licença (só cliente).
SELECT c.name                                   AS empresa,
       u.name                                   AS usuario,
       u.email,
       u.role                                   AS perfil,
       u.responsible                            AS responsavel,
       u.licensed                               AS licenciado,
       count(*)                                 AS apontamentos,
       count(DISTINCT a.ticket_number)          AS chamados,
       max(por_chamado.n)                       AS max_por_chamado,
       count(DISTINCT por_chamado.ticket_number)
         FILTER (WHERE por_chamado.n > 2)       AS chamados_acima_de_2,
       max(a.appointment_date)                  AS ultimo
  FROM portal_ticket_appointments a
  JOIN users u ON u.id = a.created_by
  LEFT JOIN companies c ON c.id = u.company_id
  JOIN LATERAL (
        SELECT a2.ticket_number, count(*) AS n
          FROM portal_ticket_appointments a2
         WHERE a2.created_by = a.created_by
           AND a2.ticket_number = a.ticket_number
           AND btrim(a2.init_time) <> btrim(a2.end_time)
         GROUP BY a2.ticket_number
       ) por_chamado ON true
 WHERE a.appointment_date >= (current_date - interval '2 months')
   AND btrim(a.init_time) <> btrim(a.end_time)
   AND u.deleted_at IS NULL
 GROUP BY c.name, u.name, u.email, u.role, u.responsible, u.licensed
 ORDER BY (u.role IN ('CLIENT', 'CLIENT_GESTOR', 'CLIENT_MEMBER')) DESC,
          empresa, usuario;

-- 2) Quem vai ser licenciado: usuários de CLIENTE ativos da Fluidra e da Alle.
--    (Equipe interna — admin, colaborador, terceiro — não tem limite e não
--    precisa de licença.)
SELECT c.name AS empresa, u.name AS usuario, u.email, u.role AS perfil,
       u.responsible AS responsavel, u.licensed AS licenciado
  FROM users u
  JOIN companies c ON c.id = u.company_id
 WHERE u.deleted_at IS NULL
   AND u.status = 'ACTIVE'
   AND u.role IN ('CLIENT', 'CLIENT_GESTOR', 'CLIENT_MEMBER')
   AND c.deleted_at IS NULL
   AND (c.name ILIKE 'fluidra%' OR lower(btrim(c.name)) = 'alle')
 ORDER BY empresa, usuario;

-- 3) Licencia. Também marca como responsável, porque a tela só mantém a
--    licença de quem é responsável (sem isso, a próxima edição do usuário
--    desmarcaria a licença). Efeito colateral: eles passam a aparecer na
--    lista de responsáveis dos chamados.
BEGIN;
UPDATE users u
   SET licensed = true,
       responsible = true,
       updated_at = now()
  FROM companies c
 WHERE c.id = u.company_id
   AND u.deleted_at IS NULL
   AND u.status = 'ACTIVE'
   AND u.role IN ('CLIENT', 'CLIENT_GESTOR', 'CLIENT_MEMBER')
   AND c.deleted_at IS NULL
   AND (c.name ILIKE 'fluidra%' OR lower(btrim(c.name)) = 'alle');
ROLLBACK;  -- troque por COMMIT para gravar
