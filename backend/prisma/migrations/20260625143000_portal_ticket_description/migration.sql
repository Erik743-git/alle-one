CREATE TABLE "portal_ticket_descriptions" (
    "ticket_number" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_ticket_descriptions_pkey" PRIMARY KEY ("ticket_number")
);

ALTER TABLE "portal_ticket_descriptions" ADD CONSTRAINT "portal_ticket_descriptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
