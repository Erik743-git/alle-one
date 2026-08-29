-- Espelha catálogo TiFlux (catálogo → área → serviço) em specialty_classifications.

ALTER TABLE "specialty_classifications"
  ADD COLUMN "tiflux_external_id" INTEGER,
  ADD COLUMN "tiflux_kind" VARCHAR(16);

CREATE UNIQUE INDEX "specialty_classifications_specialty_id_tiflux_kind_tiflux_external_id_key"
  ON "specialty_classifications" ("specialty_id", "tiflux_kind", "tiflux_external_id");

CREATE INDEX "specialty_classifications_specialty_id_tiflux_kind_idx"
  ON "specialty_classifications" ("specialty_id", "tiflux_kind");
