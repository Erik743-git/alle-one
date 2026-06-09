CREATE TABLE "service_desk_classifications" (
  "id" TEXT NOT NULL,
  "service_desk_id" TEXT NOT NULL,
  "parent_id" TEXT,
  "name" TEXT NOT NULL,
  "level" INTEGER NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "service_desk_classifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "service_desk_classifications_service_desk_id_idx"
  ON "service_desk_classifications"("service_desk_id");

CREATE INDEX "service_desk_classifications_parent_id_idx"
  ON "service_desk_classifications"("parent_id");

CREATE UNIQUE INDEX "service_desk_classifications_service_desk_id_parent_id_name_key"
  ON "service_desk_classifications"("service_desk_id", "parent_id", "name");

ALTER TABLE "service_desk_classifications"
ADD CONSTRAINT "service_desk_classifications_service_desk_id_fkey"
FOREIGN KEY ("service_desk_id") REFERENCES "service_desks"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_desk_classifications"
ADD CONSTRAINT "service_desk_classifications_parent_id_fkey"
FOREIGN KEY ("parent_id") REFERENCES "service_desk_classifications"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
