-- Reacao rapida, destaque do que chegou depois da ultima visita
-- e aviso no correio para quem recebeu bilhete.

ALTER TYPE "MailboxNotificationKind" ADD VALUE IF NOT EXISTS 'MURAL_NOTE_RECEIVED';

CREATE TABLE IF NOT EXISTS "mural_note_reactions" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "emoji" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mural_note_reactions_pkey" PRIMARY KEY ("id")
);

-- Uma pessoa da cada reacao uma vez por bilhete; clicar de novo desfaz.
CREATE UNIQUE INDEX IF NOT EXISTS "mural_note_reactions_note_id_user_id_emoji_key"
  ON "mural_note_reactions"("note_id", "user_id", "emoji");
CREATE INDEX IF NOT EXISTS "mural_note_reactions_note_id_idx"
  ON "mural_note_reactions"("note_id");

ALTER TABLE "mural_note_reactions"
  ADD CONSTRAINT "mural_note_reactions_note_id_fkey"
  FOREIGN KEY ("note_id") REFERENCES "mural_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mural_note_reactions"
  ADD CONSTRAINT "mural_note_reactions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "mural_visits" (
    "user_id" TEXT NOT NULL,
    "seen_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mural_visits_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "mural_visits"
  ADD CONSTRAINT "mural_visits_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
