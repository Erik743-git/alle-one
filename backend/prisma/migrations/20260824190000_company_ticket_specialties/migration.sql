-- Especialidades (catálogos) que cada empresa cliente pode usar ao abrir tickets.
CREATE TABLE "company_ticket_specialties" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "specialty_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_ticket_specialties_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_ticket_specialties_company_id_specialty_id_key"
    ON "company_ticket_specialties"("company_id", "specialty_id");

CREATE INDEX "company_ticket_specialties_company_id_idx"
    ON "company_ticket_specialties"("company_id");

ALTER TABLE "company_ticket_specialties"
    ADD CONSTRAINT "company_ticket_specialties_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_ticket_specialties"
    ADD CONSTRAINT "company_ticket_specialties_specialty_id_fkey"
    FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
