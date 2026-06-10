-- Enums de relatório + remoção de refresh_tokens (não utilizado).

DROP TABLE IF EXISTS "refresh_tokens";

CREATE TYPE "ReportType" AS ENUM ('1', '4');
CREATE TYPE "ReportStatus" AS ENUM ('READY', 'FAILED');
CREATE TYPE "ReportFormat" AS ENUM ('CSV', 'XLSX');

ALTER TABLE "reports"
  ALTER COLUMN "type" TYPE "ReportType" USING (
    CASE
      WHEN "type" IN ('1', '4') THEN "type"::"ReportType"
      ELSE '1'::"ReportType"
    END
  );

ALTER TABLE "reports"
  ALTER COLUMN "format" TYPE "ReportFormat" USING (
    CASE
      WHEN UPPER("format") = 'XLSX' THEN 'XLSX'::"ReportFormat"
      ELSE 'CSV'::"ReportFormat"
    END
  );

ALTER TABLE "reports"
  ALTER COLUMN "status" TYPE "ReportStatus" USING (
    CASE
      WHEN UPPER("status") = 'FAILED' THEN 'FAILED'::"ReportStatus"
      ELSE 'READY'::"ReportStatus"
    END
  );
