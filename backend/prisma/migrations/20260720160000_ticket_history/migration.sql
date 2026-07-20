CREATE TABLE "ticket_history" (
  "id" UUID NOT NULL,
  "ticket_number" INTEGER NOT NULL,
  "event_type" VARCHAR(80) NOT NULL,
  "summary" TEXT NOT NULL,
  "actor_name" VARCHAR(255),
  "source" VARCHAR(20) NOT NULL DEFAULT 'TIFLUX',
  "external_key" VARCHAR(255),
  "payload" JSONB,
  "occurred_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ticket_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ticket_history_ticket_occurred_idx"
  ON "ticket_history"("ticket_number", "occurred_at" DESC);

CREATE UNIQUE INDEX "ticket_history_dedupe_idx"
  ON "ticket_history"("ticket_number", "source", "external_key")
  WHERE "external_key" IS NOT NULL;
