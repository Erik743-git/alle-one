-- Garante ReportType cobrança/fechamento PP ('6') após criação do enum em 20260816.
ALTER TYPE "ReportType" ADD VALUE IF NOT EXISTS '6';
