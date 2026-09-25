-- ReportType: cobrança / fechamento PP ('6').
-- Historicamente fazia ALTER TYPE "ReportType" ADD VALUE '6', mas o enum
-- "ReportType" só é criado em 20260816120000_report_enums_refresh_token_drop.
-- Em banco vazio (CI) isso gerava P3018 / 42704. O valor é garantido pela
-- migration 20260823120100_report_type_cobranca_ensure.
SELECT 1;
