-- Historicamente tentava ALTER TYPE "ReportType" ADD VALUE '5', mas o enum
-- "ReportType" só é criado em 20260816120000_report_enums_refresh_token_drop.
-- Em banco vazio (CI) isso gerava P3018 / 42704. O valor INVENTARIO ('5')
-- é garantido pela migration 20260823120000_report_type_inventario_ensure.
SELECT 1;
