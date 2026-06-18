-- Preferências por administrador: quais colaboradores aparecem na lista de Apontamentos
CREATE TABLE "rendimento_admin_collaborator_list_prefs" (
    "admin_user_id" TEXT NOT NULL,
    "collaborator_user_id" TEXT NOT NULL,
    "listed" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rendimento_admin_collaborator_list_prefs_pkey" PRIMARY KEY ("admin_user_id","collaborator_user_id")
);

CREATE INDEX "rendimento_admin_collaborator_list_prefs_admin_user_id_idx" ON "rendimento_admin_collaborator_list_prefs"("admin_user_id");

ALTER TABLE "rendimento_admin_collaborator_list_prefs" ADD CONSTRAINT "rendimento_admin_collaborator_list_prefs_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rendimento_admin_collaborator_list_prefs" ADD CONSTRAINT "rendimento_admin_collaborator_list_prefs_collaborator_user_id_fkey" FOREIGN KEY ("collaborator_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
