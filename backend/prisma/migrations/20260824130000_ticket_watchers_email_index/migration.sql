-- Acelera "Meus chamados" quando o usuário é seguidor (cópia).
CREATE INDEX IF NOT EXISTS portal_ticket_watchers_email_idx
  ON portal_ticket_watchers (email);
