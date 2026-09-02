#!/usr/bin/env bash
# Alle One — deploy rápido só do frontend em PRODUÇÃO
#
# Uso (usuário alleone na VM):
#   bash /home/alleone/producao/deploy/scripts/deploy-frontend-prod.sh
#
# Variáveis opcionais:
#   ALLEONE_ROOT=/home/alleone/producao
#   ALLEONE_BRANCH=feat/cutover-tiflux-hardening-20260727
#   WEB_NAME=alleone-web
set -euo pipefail

ROOT="${ALLEONE_ROOT:-/home/alleone/producao}"
BRANCH="${ALLEONE_BRANCH:-feat/cutover-tiflux-hardening-20260727}"
FRONTEND="$ROOT/frontend"
ECOSYSTEM="$ROOT/deploy/ecosystem.config.cjs"
WEB_NAME="${ALLEONE_WEB_NAME:-alleone-web}"
API_INTERNAL_URL="${ALLEONE_API_INTERNAL_URL:-http://127.0.0.1:3000/api}"
WEB_URL="${ALLEONE_WEB_URL:-http://127.0.0.1:3001/login}"

# shellcheck source=lib/deploy-common.sh
source "$ROOT/deploy/scripts/lib/deploy-common.sh"

if [[ "$(whoami)" != "alleone" ]]; then
  echo "AVISO: rode como usuário alleone (atual: $(whoami))"
fi

cd "$ROOT"
echo "==> git pull ($ROOT) branch=$BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull origin "$BRANCH"
git log -1 --oneline

cd "$FRONTEND"
echo "==> frontend: npm ci (inclui devDependencies para o build)"
npm ci --include=dev

echo "==> frontend: npm run build (API_INTERNAL_URL=$API_INTERNAL_URL)"
export API_INTERNAL_URL
npm run build

echo "==> pm2 restart $WEB_NAME"
restart_pm2_app "$ECOSYSTEM" "$WEB_NAME"

echo "==> health Web ($WEB_URL)"
curl -sf -o /dev/null -w "web:%{http_code}\n" "$WEB_URL" || true

echo ""
echo "OK — frontend de produção atualizado."
echo "Público: https://alleone.alletecnologia.com"
