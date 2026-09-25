-- Administracao > Acesso por perfil (docs/desenho/ACESSO-POR-PERFIL.md).
-- Cria a tabela e grava o comportamento de hoje, para nada mudar no deploy.

CREATE TABLE IF NOT EXISTS "acesso_modulos" (
    "chave" VARCHAR(60) NOT NULL,
    "em_construcao" BOOLEAN NOT NULL DEFAULT false,
    "colaborador" BOOLEAN NOT NULL DEFAULT false,
    "terceiro" BOOLEAN NOT NULL DEFAULT false,
    "cliente_gestor" BOOLEAN NOT NULL DEFAULT false,
    "cliente_membro" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT,
    CONSTRAINT "acesso_modulos_pkey" PRIMARY KEY ("chave")
);

-- (chave, em_construcao, colaborador, terceiro, cliente_gestor, cliente_membro)
-- Em construcao = o que a producao ja esconde hoje pela variavel
-- NEXT_PUBLIC_MODULOS_DESABILITADOS (financeiro, inventario, projetos e o
-- bloco de horas de Apontamentos). Na teste, o admin desliga a chave.
-- Os perfis repetem o acesso de hoje; a permissao fina por usuario continua
-- valendo por baixo.
INSERT INTO "acesso_modulos"
  ("chave", "em_construcao", "colaborador", "terceiro", "cliente_gestor", "cliente_membro", "updated_at")
VALUES
  ('dashboard',          false, true,  true,  true,  true,  now()),
  ('tickets',            false, true,  true,  true,  true,  now()),
  ('pre-tickets',        false, true,  false, false, false, now()),
  ('monitoramento',      false, true,  true,  true,  true,  now()),
  ('agendas',            false, true,  false, false, false, now()),
  ('mural',              false, true,  false, false, false, now()),
  ('oportunidades',      false, true,  false, false, false, now()),
  ('financeiro',         true,  true,  true,  true,  true,  now()),
  ('gmud',               false, true,  true,  true,  true,  now()),
  ('relatorios',         false, false, false, false, false, now()),
  ('apontamentos',       false, true,  true,  true,  true,  now()),
  ('apontamentos-horas', true,  true,  true,  true,  true,  now()),
  ('inventario',         true,  true,  true,  true,  true,  now()),
  ('projetos',           true,  true,  true,  true,  true,  now()),
  ('aplicativos',        false, true,  true,  true,  true,  now())
ON CONFLICT ("chave") DO NOTHING;

-- Mesmo formato das outras tabelas com @updatedAt (sem default no banco).
ALTER TABLE "acesso_modulos" ALTER COLUMN "updated_at" DROP DEFAULT;
