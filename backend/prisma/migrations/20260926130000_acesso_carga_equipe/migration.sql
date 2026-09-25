-- Acesso por perfil: nova linha para a aba "Carga da equipe" de Apontamentos.
-- Comeca so para admin (colaborador desligado); o admin libera na tela.
INSERT INTO "acesso_modulos"
  ("chave", "em_construcao", "colaborador", "terceiro", "cliente_gestor", "cliente_membro", "updated_at")
VALUES ('carga-equipe', false, false, false, false, false, now())
ON CONFLICT ("chave") DO NOTHING;
