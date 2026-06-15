-- GMUD do ticket: referência externa informada pelo cliente (não FK para gmud do portal).
ALTER TABLE "portal_ticket_gmud_links" DROP CONSTRAINT IF EXISTS "portal_ticket_gmud_links_gmud_id_fkey";
DROP INDEX IF EXISTS "portal_ticket_gmud_links_gmud_id_idx";
ALTER TABLE "portal_ticket_gmud_links" DROP COLUMN IF EXISTS "gmud_id";
ALTER TABLE "portal_ticket_gmud_links" ADD COLUMN IF NOT EXISTS "external_gmud_ref" VARCHAR(120);

UPDATE "portal_ticket_gmud_links"
SET "external_gmud_ref" = ''
WHERE "external_gmud_ref" IS NULL;

ALTER TABLE "portal_ticket_gmud_links"
  ALTER COLUMN "external_gmud_ref" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "portal_ticket_gmud_links_external_gmud_ref_idx"
  ON "portal_ticket_gmud_links"("external_gmud_ref");
