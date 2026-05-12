/*
  Warnings:

  - Added the required column `period_end` to the `reports` table without a default value. This is not possible if the table is not empty.
  - Added the required column `period_start` to the `reports` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "error_message" TEXT,
ADD COLUMN     "filters" JSONB,
ADD COLUMN     "format" TEXT NOT NULL DEFAULT 'CSV',
ADD COLUMN     "period_end" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "period_start" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'READY';
