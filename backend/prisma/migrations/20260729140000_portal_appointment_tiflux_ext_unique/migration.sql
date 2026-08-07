-- UNIQUE parcial: permite vários NULL (apontamentos só-portal),
-- evita duplicar o mesmo external_id TiFlux no ETL.
-- Tabela só é criada em 20260810120000 — em DB limpo esta migration é no-op.
DO $$
BEGIN
  IF to_regclass('public.portal_ticket_appointments') IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM portal_ticket_appointments a
  USING portal_ticket_appointments b
  WHERE a.tiflux_appointment_external_id IS NOT NULL
    AND a.tiflux_appointment_external_id = b.tiflux_appointment_external_id
    AND a.ctid < b.ctid;

  DROP INDEX IF EXISTS portal_ticket_appointments_tiflux_appointment_external_id_idx;

  CREATE UNIQUE INDEX IF NOT EXISTS portal_ticket_appointments_tiflux_ext_id_uidx
    ON portal_ticket_appointments (tiflux_appointment_external_id)
    WHERE tiflux_appointment_external_id IS NOT NULL;
END $$;
