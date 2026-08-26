-- Padroniza status de rendimento como enum (valores já validados por CHECK ou uso real).
CREATE TYPE "RendimentoDayEventStatus" AS ENUM ('ACTIVE', 'PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "RendimentoGapJustificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "rendimento_day_events" DROP CONSTRAINT IF EXISTS "rendimento_day_events_status_chk";
ALTER TABLE "rendimento_day_events" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "rendimento_day_events"
  ALTER COLUMN "status" TYPE "RendimentoDayEventStatus"
  USING ("status"::text::"RendimentoDayEventStatus");
ALTER TABLE "rendimento_day_events"
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"RendimentoDayEventStatus";

ALTER TABLE "rendimento_gap_justifications" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "rendimento_gap_justifications"
  ALTER COLUMN "status" TYPE "RendimentoGapJustificationStatus"
  USING ("status"::text::"RendimentoGapJustificationStatus");
ALTER TABLE "rendimento_gap_justifications"
  ALTER COLUMN "status" SET DEFAULT 'PENDING'::"RendimentoGapJustificationStatus";
