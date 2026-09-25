-- Fechamento do ciclo de horas (Apontamentos > Fechamento). So cria tabelas.

-- CreateTable
CREATE TABLE "fechamento_ciclos" (
    "ciclo" VARCHAR(7) NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE NOT NULL,
    "fechado" BOOLEAN NOT NULL DEFAULT true,
    "fechado_em" TIMESTAMP(3) NOT NULL,
    "fechado_por" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fechamento_ciclos_pkey" PRIMARY KEY ("ciclo")
);

-- CreateTable
CREATE TABLE "fechamento_eventos" (
    "id" TEXT NOT NULL,
    "ciclo" VARCHAR(7) NOT NULL,
    "acao" VARCHAR(10) NOT NULL,
    "motivo" TEXT,
    "pendencias" INTEGER,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fechamento_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fechamento_ciclos_inicio_fim_idx" ON "fechamento_ciclos"("inicio", "fim");

-- CreateIndex
CREATE INDEX "fechamento_eventos_ciclo_created_at_idx" ON "fechamento_eventos"("ciclo", "created_at");

-- AddForeignKey
ALTER TABLE "fechamento_eventos" ADD CONSTRAINT "fechamento_eventos_ciclo_fkey" FOREIGN KEY ("ciclo") REFERENCES "fechamento_ciclos"("ciclo") ON DELETE CASCADE ON UPDATE CASCADE;
