-- Jornada personalizada por usuário (horas de trabalho e almoço para Rendimento)
ALTER TABLE "users" ADD COLUMN "rendimento_custom_schedule" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "rendimento_daily_work_minutes" INTEGER;
ALTER TABLE "users" ADD COLUMN "rendimento_lunch_minutes" INTEGER;
