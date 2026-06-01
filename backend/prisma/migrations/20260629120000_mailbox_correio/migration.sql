-- Módulo Correio: notificações in-app por usuário
ALTER TYPE "PermissionModule" ADD VALUE IF NOT EXISTS 'CORREIO';

CREATE TYPE "MailboxNotificationKind" AS ENUM (
  'RENDIMENTO_ALERT',
  'RENDIMENTO_APPROVAL_PENDING',
  'CONTRACT_USAGE',
  'GMUD_PENDING_APPROVAL',
  'TICKET_NO_APPOINTMENT_24H',
  'TICKET_STALLED_48H',
  'TICKET_STALLED_7D'
);

CREATE TABLE IF NOT EXISTS "mailbox_notifications" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "kind" "MailboxNotificationKind" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "href" TEXT,
  "payload" JSONB,
  "dedupe_key" TEXT NOT NULL,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "mailbox_notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mailbox_notifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "mailbox_notifications_user_id_dedupe_key_key"
  ON "mailbox_notifications"("user_id", "dedupe_key");

CREATE INDEX IF NOT EXISTS "mailbox_notifications_user_id_read_at_idx"
  ON "mailbox_notifications"("user_id", "read_at");
