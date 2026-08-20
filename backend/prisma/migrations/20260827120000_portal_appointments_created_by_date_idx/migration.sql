-- Acelera listagem de apontamentos por colaborador + período (hub /apontamentos).
CREATE INDEX IF NOT EXISTS "portal_ticket_appointments_created_by_appointment_date_idx"
  ON "portal_ticket_appointments"("created_by", "appointment_date");
