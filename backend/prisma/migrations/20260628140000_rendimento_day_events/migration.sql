-- Eventos persistidos de rendimento (alertas, almoço, justificativas, HE, plantão).
CREATE TABLE IF NOT EXISTS rendimento_day_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date_ref DATE NOT NULL,
  event_type TEXT NOT NULL,
  from_time TIME NULL,
  to_time TIME NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  appointment_external_id BIGINT NULL,
  justification_id TEXT NULL,
  label TEXT NULL,
  description TEXT NULL,
  reason TEXT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  debit_protected BOOLEAN NOT NULL DEFAULT false,
  source_key TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP NULL,
  deleted_at TIMESTAMP NULL,
  CONSTRAINT rendimento_day_events_type_chk CHECK (
    event_type IN ('IDLE_ALERT', 'LUNCH', 'JUSTIFICATION', 'OVERTIME', 'PLANTAO')
  ),
  CONSTRAINT rendimento_day_events_status_chk CHECK (
    status IN ('ACTIVE', 'PENDING', 'APPROVED', 'REJECTED')
  ),
  CONSTRAINT rendimento_day_events_user_source_uniq UNIQUE (user_id, source_key)
);

CREATE INDEX IF NOT EXISTS idx_rendimento_day_events_user_date
  ON rendimento_day_events (user_id, date_ref);

CREATE INDEX IF NOT EXISTS idx_rendimento_day_events_type_status
  ON rendimento_day_events (event_type, status);

CREATE INDEX IF NOT EXISTS idx_rendimento_day_events_justification
  ON rendimento_day_events (justification_id)
  WHERE justification_id IS NOT NULL;
