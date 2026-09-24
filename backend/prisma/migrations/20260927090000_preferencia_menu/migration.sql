-- Personalizar menu: ordem e itens escondidos por pessoa. So cria tabela.

-- CreateTable
CREATE TABLE "preferencias_menu" (
    "user_id" TEXT NOT NULL,
    "ordem" JSONB NOT NULL DEFAULT '[]',
    "visivel" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preferencias_menu_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "preferencias_menu" ADD CONSTRAINT "preferencias_menu_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
