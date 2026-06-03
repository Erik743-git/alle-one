-- Justificativas de lacunas de rendimento e saldo de horas extras.
CREATE TABLE IF NOT EXISTS rendimento_gap_justifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date_ref DATE NOT NULL,
  from_time TIME NOT NULL,
  to_time TIME NOT NULL,
  gap_type TEXT NOT NULL,
  gap_minutes INTEGER NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  reason TEXT NOT NULL,
  debit_overtime BOOLEAN NOT NULL DEFAULT false,
  overtime_minutes INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP NULL,
  note TEXT NULL,
  deleted_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_rendimento_gap_justifications_user_date
  ON rendimento_gap_justifications (user_id, date_ref);

CREATE INDEX IF NOT EXISTS idx_rendimento_gap_justifications_status
  ON rendimento_gap_justifications (status);

CREATE TABLE IF NOT EXISTS rendimento_overtime_balances (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  minutes INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
