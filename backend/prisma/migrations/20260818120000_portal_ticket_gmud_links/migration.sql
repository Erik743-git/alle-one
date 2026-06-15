-- Vínculo portal entre ticket TiFlux (número) e GMUD Alle (id).
CREATE TABLE "portal_ticket_gmud_links" (
    "ticket_number" INTEGER NOT NULL,
    "gmud_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_ticket_gmud_links_pkey" PRIMARY KEY ("ticket_number")
);

CREATE INDEX "portal_ticket_gmud_links_gmud_id_idx" ON "portal_ticket_gmud_links"("gmud_id");

ALTER TABLE "portal_ticket_gmud_links" ADD CONSTRAINT "portal_ticket_gmud_links_gmud_id_fkey" FOREIGN KEY ("gmud_id") REFERENCES "gmud"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "portal_ticket_gmud_links" ADD CONSTRAINT "portal_ticket_gmud_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
