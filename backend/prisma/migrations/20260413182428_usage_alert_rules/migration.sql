-- CreateTable
CREATE TABLE "usage_alert_rules" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "day_of_month" INTEGER NOT NULL DEFAULT 15,
    "low_threshold_pct" INTEGER,
    "high_threshold_pct" INTEGER,
    "recipients" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usage_alert_rules_company_id_idx" ON "usage_alert_rules"("company_id");

-- CreateIndex
CREATE INDEX "usage_alert_rules_enabled_day_of_month_idx" ON "usage_alert_rules"("enabled", "day_of_month");

-- AddForeignKey
ALTER TABLE "usage_alert_rules" ADD CONSTRAINT "usage_alert_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
