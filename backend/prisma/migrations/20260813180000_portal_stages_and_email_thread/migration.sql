-- Vocabulário canônico de estágios + metadados de thread de e-mail

-- 1) Catálogo ticket_stages
UPDATE ticket_stages SET name = 'Novo', sort_order = 1, updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL AND lower(name) IN ('pendente', 'novo');

UPDATE ticket_stages SET name = 'Em Atendimento', sort_order = 2, updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL AND (
  lower(name) IN ('em execução', 'em execucao', 'em atendimento', 'em andamento')
);

UPDATE ticket_stages SET name = 'Encerrado', sort_order = 5, updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL AND lower(name) IN ('fechado', 'encerrado');

UPDATE ticket_stages SET name = 'Cancelado', sort_order = 6, updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL AND lower(name) = 'cancelado';

UPDATE ticket_stages SET name = 'Aguardando Cliente', sort_order = 3, updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL AND lower(name) IN ('aguardando usuário', 'aguardando usuario', 'aguardando cliente');

INSERT INTO ticket_stages (id, name, is_system, syncs_to_tiflux, active, sort_order, updated_at)
SELECT gen_random_uuid(), 'Resolvido', true, false, true, 4, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM ticket_stages WHERE deleted_at IS NULL AND lower(name) = 'resolvido'
);

INSERT INTO ticket_stages (id, name, is_system, syncs_to_tiflux, active, sort_order, updated_at)
SELECT gen_random_uuid(), 'Aguardando Cliente', false, false, true, 3, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM ticket_stages WHERE deleted_at IS NULL AND lower(name) = 'aguardando cliente'
);

-- 2) Dados em portal_tickets
UPDATE portal_tickets SET stage_name = 'Novo', updated_at = CURRENT_TIMESTAMP
WHERE stage_name IS NOT NULL AND lower(trim(stage_name)) IN ('aberto', 'pendente', 'novo', 'pending');

UPDATE portal_tickets SET status_name = 'Novo', updated_at = CURRENT_TIMESTAMP
WHERE status_name IS NOT NULL AND lower(trim(status_name)) IN ('aberto', 'pendente', 'novo', 'pending');

UPDATE portal_tickets SET stage_name = 'Em Atendimento', updated_at = CURRENT_TIMESTAMP
WHERE stage_name IS NOT NULL AND (
  lower(trim(stage_name)) IN ('em andamento', 'em atendimento', 'em execução', 'em execucao', 'in progress')
  OR lower(trim(stage_name)) LIKE 'em execu%'
);

UPDATE portal_tickets SET status_name = 'Em Atendimento', updated_at = CURRENT_TIMESTAMP
WHERE status_name IS NOT NULL AND (
  lower(trim(status_name)) IN ('em andamento', 'em atendimento', 'em execução', 'em execucao', 'in progress')
  OR lower(trim(status_name)) LIKE 'em execu%'
);

UPDATE portal_tickets SET stage_name = 'Aguardando Cliente', updated_at = CURRENT_TIMESTAMP
WHERE stage_name IS NOT NULL AND (
  lower(trim(stage_name)) LIKE 'aguardando%'
  OR lower(trim(stage_name)) LIKE 'waiting%'
);

UPDATE portal_tickets SET status_name = 'Aguardando Cliente', updated_at = CURRENT_TIMESTAMP
WHERE status_name IS NOT NULL AND (
  lower(trim(status_name)) LIKE 'aguardando%'
  OR lower(trim(status_name)) LIKE 'waiting%'
);

UPDATE portal_tickets SET stage_name = 'Resolvido', updated_at = CURRENT_TIMESTAMP
WHERE stage_name IS NOT NULL AND lower(trim(stage_name)) IN ('resolvido', 'resolved');

UPDATE portal_tickets SET status_name = 'Resolvido', updated_at = CURRENT_TIMESTAMP
WHERE status_name IS NOT NULL AND lower(trim(status_name)) IN ('resolvido', 'resolved');

UPDATE portal_tickets SET stage_name = 'Encerrado', updated_at = CURRENT_TIMESTAMP
WHERE stage_name IS NOT NULL AND lower(trim(stage_name)) IN ('fechado', 'encerrado', 'closed');

UPDATE portal_tickets SET status_name = 'Encerrado', updated_at = CURRENT_TIMESTAMP
WHERE status_name IS NOT NULL AND lower(trim(status_name)) IN ('fechado', 'encerrado', 'closed');

UPDATE portal_tickets SET stage_name = 'Cancelado', updated_at = CURRENT_TIMESTAMP
WHERE stage_name IS NOT NULL AND lower(trim(stage_name)) IN ('cancelado', 'cancelled', 'canceled');

UPDATE portal_tickets SET status_name = 'Cancelado', updated_at = CURRENT_TIMESTAMP
WHERE status_name IS NOT NULL AND lower(trim(status_name)) IN ('cancelado', 'cancelled', 'canceled');

-- 3) Thread de e-mail
ALTER TABLE "portal_tickets"
  ADD COLUMN IF NOT EXISTS "email_conversation_id" TEXT;

CREATE INDEX IF NOT EXISTS "portal_tickets_email_conversation_id_idx"
  ON "portal_tickets"("email_conversation_id");

ALTER TABLE "pre_tickets"
  ADD COLUMN IF NOT EXISTS "conversation_id" TEXT,
  ADD COLUMN IF NOT EXISTS "in_reply_to" TEXT,
  ADD COLUMN IF NOT EXISTS "references_header" TEXT,
  ADD COLUMN IF NOT EXISTS "possible_duplicate_subject" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "linked_ticket_number" INTEGER,
  ADD COLUMN IF NOT EXISTS "applied_to_ticket" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "pre_tickets_conversation_id_idx"
  ON "pre_tickets"("conversation_id");

CREATE INDEX IF NOT EXISTS "pre_tickets_linked_ticket_number_idx"
  ON "pre_tickets"("linked_ticket_number");
