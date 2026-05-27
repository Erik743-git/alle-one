-- Índice no schema tiflux (dados do sync). Acelera Rendimento e relatórios por usuário + data.
--
-- Observação: o schema/tabela do sync podem ser criados por outro processo.
-- Para não quebrar o primeiro deploy (banco vazio), criamos o índice somente
-- se a tabela existir.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'tiflux'
      AND c.relname = 'ticket_appointments'
      AND c.relkind = 'r'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "idx_tiflux_ticket_appointments_user_date" ON "tiflux"."ticket_appointments" ("user_external_id", "appointment_date")';
  END IF;
END $$;
