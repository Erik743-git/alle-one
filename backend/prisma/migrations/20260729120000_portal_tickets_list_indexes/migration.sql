-- Índices compostos para listagens pesadas de portal_tickets
CREATE INDEX IF NOT EXISTS "portal_tickets_is_closed_responsible_external_id_updated_at_source_idx"
  ON "portal_tickets"("is_closed", "responsible_external_id", "updated_at_source");

CREATE INDEX IF NOT EXISTS "portal_tickets_is_closed_client_external_id_created_at_source_idx"
  ON "portal_tickets"("is_closed", "client_external_id", "created_at_source");
