ALTER TABLE "companies" ADD COLUMN "monitoring_priority" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "companies_monitoring_priority_idx" ON "companies"("monitoring_priority");
