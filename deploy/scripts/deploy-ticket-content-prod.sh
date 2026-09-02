#!/usr/bin/env bash
# Alle One — pipeline completo: sync TiFlux (espelho) + deploy portal prod + ETL conteúdo
#
# Uso (usuário alleone na VM):
#   bash /home/alleone/producao/deploy/scripts/deploy-ticket-content-prod.sh
#
# Opções (env):
#   TIFLUX_CONTENT_BACKFILL=1     — força re-sync de descrição/anexos no espelho
#   ETL_TICKET=75730              — importa só um ticket (senão importa todos)
#   SKIP_SYNC=1                   — pula atualizar-tiflux-sync
#   SKIP_PORTAL_DEPLOY=1          — pula pos-deploy alle-one
#   SKIP_ETL=1                    — pula ETL portal
set -euo pipefail

ROOT="${ALLEONE_ROOT:-/home/alleone/producao}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/deploy-common.sh
source "$SCRIPT_DIR/lib/deploy-common.sh"

if [[ "${SKIP_SYNC:-}" != "1" ]]; then
  echo "========== 1/3 Sync TiFlux (espelho) =========="
  bash "$SCRIPT_DIR/atualizar-tiflux-sync.sh"
  echo ""
  echo "Aguarde o sync popular tiflux.ticket_files (pm2 logs alleone-tiflux-sync)."
  echo "Quando houver linhas em tiflux.ticket_files, o ETL abaixo importa para o portal."
  echo ""
fi

if [[ "${SKIP_PORTAL_DEPLOY:-}" != "1" ]]; then
  echo "========== 2/3 Deploy portal (prod) =========="
  bash "$ROOT/deploy/scripts/pos-deploy-alleone.sh"
fi

if [[ "${SKIP_ETL:-}" != "1" ]]; then
  echo "========== 3/3 ETL espelho → portal =========="
  cd "$ROOT/backend"

  ETL_ARGS=()
  if [[ -n "${ETL_TICKET:-}" ]]; then
    ETL_ARGS+=(--ticket="$ETL_TICKET")
  fi

  # dotenv/config no script TypeScript lê o .env (sem source bash).
  npx ts-node prisma/scripts/etl-tiflux-ticket-content-to-portal.ts "${ETL_ARGS[@]}"

  load_database_url "$ROOT/backend/.env"
  echo ""
  psql "$DATABASE_URL" -c "SELECT count(*) AS portal_descriptions FROM portal_ticket_descriptions;"
  psql "$DATABASE_URL" -c \
    "SELECT count(*) AS anexos_ticket FROM portal_ticket_appointment_attachments WHERE portal_appointment_id IS NULL;"
fi

echo ""
echo "Concluído. Valide um ticket em https://alleone.alletecnologia.com/tickets/"
