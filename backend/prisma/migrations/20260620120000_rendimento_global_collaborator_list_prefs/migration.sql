-- Preferência global de visibilidade na lista de Apontamentos (todos os admins).
CREATE TABLE "rendimento_collaborator_list_prefs" (
    "collaborator_user_id" TEXT NOT NULL,
    "listed" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rendimento_collaborator_list_prefs_pkey" PRIMARY KEY ("collaborator_user_id")
);

INSERT INTO "rendimento_collaborator_list_prefs" ("collaborator_user_id", "listed", "updated_at")
SELECT
    "collaborator_user_id",
    BOOL_OR("listed"),
    NOW()
FROM "rendimento_admin_collaborator_list_prefs"
GROUP BY "collaborator_user_id";

ALTER TABLE "rendimento_collaborator_list_prefs"
ADD CONSTRAINT "rendimento_collaborator_list_prefs_collaborator_user_id_fkey"
FOREIGN KEY ("collaborator_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "rendimento_admin_collaborator_list_prefs";
