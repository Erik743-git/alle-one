CREATE TABLE "ticket_auto_open_rule_attachments" (
  "id" TEXT NOT NULL,
  "rule_id" TEXT NOT NULL,
  "file_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_auto_open_rule_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_auto_open_rule_attachments_rule_id_file_id_key"
  ON "ticket_auto_open_rule_attachments" ("rule_id", "file_id");

CREATE INDEX "ticket_auto_open_rule_attachments_rule_id_idx"
  ON "ticket_auto_open_rule_attachments" ("rule_id");

ALTER TABLE "ticket_auto_open_rule_attachments"
  ADD CONSTRAINT "ticket_auto_open_rule_attachments_rule_id_fkey"
  FOREIGN KEY ("rule_id") REFERENCES "ticket_auto_open_rules"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_auto_open_rule_attachments"
  ADD CONSTRAINT "ticket_auto_open_rule_attachments_file_id_fkey"
  FOREIGN KEY ("file_id") REFERENCES "files"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
