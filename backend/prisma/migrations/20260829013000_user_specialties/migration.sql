CREATE TABLE "user_specialties" (
  "user_id" TEXT NOT NULL,
  "specialty_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_specialties_pkey" PRIMARY KEY ("user_id", "specialty_id")
);

CREATE INDEX "user_specialties_specialty_id_idx" ON "user_specialties"("specialty_id");

ALTER TABLE "user_specialties"
  ADD CONSTRAINT "user_specialties_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_specialties"
  ADD CONSTRAINT "user_specialties_specialty_id_fkey"
  FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "user_specialties" ("user_id", "specialty_id")
SELECT u.id, u.specialty_id
FROM "users" u
WHERE u.specialty_id IS NOT NULL
  AND u.deleted_at IS NULL
ON CONFLICT DO NOTHING;
