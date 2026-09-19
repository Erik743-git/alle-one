-- Pesquisa de satisfação por chamado (uma por chamado).
-- A nota é de 1 a 5 estrelas; o NPS é derivado dela no relatório.
CREATE TABLE IF NOT EXISTS "ticket_satisfaction_surveys" (
  "id"                TEXT PRIMARY KEY,
  "ticket_number"     INTEGER NOT NULL,
  -- Token do link do e-mail: responde sem entrar no portal.
  "token"             TEXT NOT NULL,
  "requestor_email"   VARCHAR(255) NOT NULL,
  "requestor_name"    VARCHAR(255),
  "company_id"        TEXT,
  "specialty_id"      TEXT,
  -- Quem estava com o chamado no fechamento; é para quem a nota conta.
  "responsible_name"  VARCHAR(255),
  "responsible_external_id" INTEGER,
  "stage_name"        VARCHAR(80),
  "sent_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answered_at"       TIMESTAMP(3),
  "rating"            SMALLINT,
  "comment"           TEXT,
  -- EMAIL | PORTAL: por onde a pessoa respondeu.
  "channel"           VARCHAR(20),
  -- Quantas vezes o card foi dispensado no portal; para parar de insistir.
  "dismissed_count"   INTEGER NOT NULL DEFAULT 0,
  "dismissed_at"      TIMESTAMP(3),
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "ticket_satisfaction_surveys_ticket_number_key"
  ON "ticket_satisfaction_surveys" ("ticket_number");
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_satisfaction_surveys_token_key"
  ON "ticket_satisfaction_surveys" ("token");
CREATE INDEX IF NOT EXISTS "ticket_satisfaction_surveys_requestor_idx"
  ON "ticket_satisfaction_surveys" (lower("requestor_email"), "answered_at");
CREATE INDEX IF NOT EXISTS "ticket_satisfaction_surveys_answered_idx"
  ON "ticket_satisfaction_surveys" ("answered_at");
