-- Busca de tickets: indices de trigrama para o ILIKE '%termo%'.
--
-- A listagem usa `contains ... mode: insensitive` em title, requestor_name e
-- requestor_email. Com curinga a esquerda nenhum dos indices B-tree de
-- portal_tickets ajuda, entao cada busca varre a tabela inteira.
--
-- pg_trgm e "trusted" a partir do PostgreSQL 13, entao o usuario da aplicacao
-- consegue criar mesmo sem ser superusuario (verificado em producao:
-- PostgreSQL 18.6, usuario uportal, rolsuper = false).
--
-- Sem CONCURRENTLY de proposito: o prisma migrate roda dentro de transacao e
-- CREATE INDEX CONCURRENTLY nao e permitido ali. A tabela e pequena o
-- suficiente para o lock ser de segundos.
--
-- Nota: estes indices sao SQL cru e nao aparecem em schema.prisma (o Prisma
-- nao modela gin_trgm_ops sobre expressao). Um `prisma migrate dev` futuro
-- pode acusar drift — nesse caso, manter os indices e ignorar o aviso.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS portal_tickets_title_trgm_idx
  ON portal_tickets USING gin (lower(title) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS portal_tickets_requestor_name_trgm_idx
  ON portal_tickets USING gin (lower(requestor_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS portal_tickets_requestor_email_trgm_idx
  ON portal_tickets USING gin (lower(requestor_email) gin_trgm_ops);
