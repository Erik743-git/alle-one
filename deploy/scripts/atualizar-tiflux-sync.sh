#!/usr/bin/env bash
# Alle One — atualiza alleone-tiflux-sync na VM (git pull + SQL espelho + build + PM2)
#
# Uso (usuário alleone):
#   bash /home/alleone/producao/deploy/scripts/atualizar-tiflux-sync.sh
#
# Variáveis opcionais:
#   TIFLUX_SYNC_ROOT=/home/alleone/producao/alleone-tiflux-sync
#   TIFLUX_SYNC_REPO=https://github.com/Erik743-git/alleone-tiflux-sync.git
#   TIFLUX_SYNC_BRANCH=main
#   PORTAL_ENV=/home/alleone/producao/backend/.env   (DATABASE_URL para o SQL)
#   TIFLUX_SYNC_PM2=alleone-tiflux-sync
#   TIFLUX_CONTENT_BACKFILL=1   (reseta content_synced_at para reimportar descrições)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/deploy-common.sh
source "$SCRIPT_DIR/lib/deploy-common.sh"

SYNC_ROOT="${TIFLUX_SYNC_ROOT:-/home/alleone/producao/alleone-tiflux-sync}"
SYNC_REPO="${TIFLUX_SYNC_REPO:-https://github.com/Erik743-git/alleone-tiflux-sync.git}"
SYNC_BRANCH="${TIFLUX_SYNC_BRANCH:-main}"
PORTAL_ENV="${PORTAL_ENV:-/home/alleone/producao/backend/.env}"
PM2_NAME="${TIFLUX_SYNC_PM2:-alleone-tiflux-sync}"
SQL_FILE="${SYNC_ROOT}/prisma/sql/2026-09-02_ticket_content.sql"
FALLBACK_SQL="$SCRIPT_DIR/sql/2026-09-02_tiflux_ticket_content.sql"

if [[ "$(whoami)" != "alleone" ]]; then
  echo "AVISO: rode como usuário alleone (atual: $(whoami))"
fi

ensure_git_repo() {
  if [[ -d "$SYNC_ROOT/.git" ]]; then
    return 0
  fi

  echo "==> Pasta sem git — vinculando $SYNC_ROOT ao repositório remoto"
  if [[ ! -d "$SYNC_ROOT" ]]; then
    git clone --branch "$SYNC_BRANCH" "$SYNC_REPO" "$SYNC_ROOT"
    return 0
  fi

  local env_backup=""
  if [[ -f "$SYNC_ROOT/.env" ]]; then
    env_backup="$(mktemp)"
    cp "$SYNC_ROOT/.env" "$env_backup"
  fi

  cd "$SYNC_ROOT"
  git init -b "$SYNC_BRANCH"
  git remote add origin "$SYNC_REPO" 2>/dev/null || git remote set-url origin "$SYNC_REPO"
  git fetch origin "$SYNC_BRANCH"
  git checkout -B "$SYNC_BRANCH" "origin/$SYNC_BRANCH"
  git reset --hard "origin/$SYNC_BRANCH"

  if [[ -n "$env_backup" && -f "$env_backup" ]]; then
    cp "$env_backup" "$SYNC_ROOT/.env"
    rm -f "$env_backup"
  fi
}

echo "==> alleone-tiflux-sync ($SYNC_ROOT)"
ensure_git_repo

cd "$SYNC_ROOT"
echo "==> git pull"
git fetch origin "$SYNC_BRANCH"
git checkout "$SYNC_BRANCH"
git pull origin "$SYNC_BRANCH"

if [[ -f "$SQL_FILE" ]]; then
  echo "==> SQL espelho (description + ticket_files)"
  if [[ ! -f "$PORTAL_ENV" ]]; then
    echo "ERRO: PORTAL_ENV não encontrado: $PORTAL_ENV"
    exit 1
  fi
  apply_tiflux_mirror_content_sql "$PORTAL_ENV" "$SQL_FILE"
elif [[ -f "$FALLBACK_SQL" ]]; then
  echo "==> SQL espelho (cópia alle-one)"
  apply_tiflux_mirror_content_sql "$PORTAL_ENV" "$FALLBACK_SQL"
else
  echo "AVISO: SQL não encontrado em $SQL_FILE nem $FALLBACK_SQL"
fi

if [[ "${TIFLUX_CONTENT_BACKFILL:-}" == "1" ]]; then
  echo "==> Backfill: content_synced_at = NULL (reimportar descrições/anexos)"
  load_database_url "$PORTAL_ENV"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "UPDATE tiflux.tickets SET content_synced_at = NULL WHERE content_synced_at IS NOT NULL;"
fi

echo "==> npm ci + build"
npm ci --include=dev
npx prisma generate
npm run build

echo "==> pm2 restart $PM2_NAME"
pm2 restart "$PM2_NAME" --update-env || pm2 start dist/main.js --name "$PM2_NAME" --cwd "$SYNC_ROOT"
pm2 save

echo ""
echo "Sync atualizado. Acompanhe:"
echo "  pm2 logs $PM2_NAME --lines 40"
echo "  psql \"\$DATABASE_URL\" -c \"SELECT count(*) FILTER (WHERE description IS NOT NULL) AS com_descricao, count(*) FROM tiflux.ticket_files;\""
