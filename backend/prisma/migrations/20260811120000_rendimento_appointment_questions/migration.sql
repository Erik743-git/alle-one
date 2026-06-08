CREATE TYPE "RendimentoAppointmentQuestionStatus" AS ENUM ('PENDING', 'ANSWERED');

CREATE TABLE "rendimento_appointment_questions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "appointment_source" VARCHAR(16) NOT NULL,
    "appointment_ref" VARCHAR(64) NOT NULL,
    "ticket_number" INTEGER NOT NULL,
    "appointment_date" DATE NOT NULL,
    "init_time" VARCHAR(5),
    "end_time" VARCHAR(5),
    "user_name" VARCHAR(255),
    "description" TEXT,
    "message" TEXT NOT NULL,
    "status" "RendimentoAppointmentQuestionStatus" NOT NULL DEFAULT 'PENDING',
    "admin_response" TEXT,
    "admin_response_code" VARCHAR(64),
    "questioned_by" TEXT NOT NULL,
    "responded_by" TEXT,
    "responded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rendimento_appointment_questions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rendimento_appointment_questions_company_date_idx"
  ON "rendimento_appointment_questions"("company_id", "appointment_date");

CREATE INDEX "rendimento_appointment_questions_status_idx"
  ON "rendimento_appointment_questions"("status");

CREATE UNIQUE INDEX "rendimento_appointment_questions_ref_pending_uidx"
  ON "rendimento_appointment_questions"("company_id", "appointment_source", "appointment_ref")
  WHERE "status" = 'PENDING';

ALTER TABLE "rendimento_appointment_questions"
  ADD CONSTRAINT "rendimento_appointment_questions_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rendimento_appointment_questions"
  ADD CONSTRAINT "rendimento_appointment_questions_questioned_by_fkey"
  FOREIGN KEY ("questioned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rendimento_appointment_questions"
  ADD CONSTRAINT "rendimento_appointment_questions_responded_by_fkey"
  FOREIGN KEY ("responded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
