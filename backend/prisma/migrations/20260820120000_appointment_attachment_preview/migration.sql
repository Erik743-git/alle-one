ALTER TABLE "portal_ticket_appointment_attachments"
  ADD COLUMN IF NOT EXISTS "preview_data_base64" TEXT;
