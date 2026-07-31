-- Garante ReportType INVENTARIO ('5') após criação do enum em 20260816.
ALTER TYPE "ReportType" ADD VALUE IF NOT EXISTS '5';
