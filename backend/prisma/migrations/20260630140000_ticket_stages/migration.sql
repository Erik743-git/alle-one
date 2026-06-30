-- Estágios de ticket parametrizáveis (gerenciados no portal)
CREATE TABLE "ticket_stages" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "syncs_to_tiflux" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "ticket_stages_pkey" PRIMARY KEY ("id")
);

-- Estágios padrão (não podem ser editados/removidos; sincronizam com TiFlux)
INSERT INTO "ticket_stages" ("id", "name", "is_system", "syncs_to_tiflux", "active", "sort_order", "updated_at")
VALUES
  (gen_random_uuid(), 'Pendente',     true, true, true, 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Em Execução',  true, true, true, 2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Fechado',      true, true, true, 3, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Cancelado',    true, true, true, 4, CURRENT_TIMESTAMP);

-- Estágios parametrizáveis iniciais (somente portal; não refletem no TiFlux)
INSERT INTO "ticket_stages" ("id", "name", "is_system", "syncs_to_tiflux", "active", "sort_order", "updated_at")
VALUES
  (gen_random_uuid(), 'Aguardando fornecedor',  false, false, true, 5, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Aguardando terceiro',    false, false, true, 6, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Aguardando usuário',     false, false, true, 7, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Janela de manutenção',   false, false, true, 8, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Plantão',                false, false, true, 9, CURRENT_TIMESTAMP);
