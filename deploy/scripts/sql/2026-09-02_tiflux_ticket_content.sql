-- Descrição e anexos do chamado (espelho TiFlux → portal via ETL alle-one).
-- Cópia de alleone-tiflux-sync/prisma/sql/2026-09-02_ticket_content.sql
ALTER TABLE tiflux.tickets
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS content_synced_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS tiflux.ticket_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number INT NOT NULL,
  external_id INT NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  mime_type VARCHAR(255),
  size_bytes INT,
  file_data BYTEA NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tiflux_ticket_files UNIQUE (ticket_number, external_id)
);

CREATE INDEX IF NOT EXISTS idx_tiflux_ticket_files_ticket_number
  ON tiflux.ticket_files (ticket_number);
