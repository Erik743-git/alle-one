#!/usr/bin/env bash
# Alle One — pós-deploy (usuário alleone): pull + migrate + build API + web + restart
set -euo pipefail

ROOT="${ALLEONE_ROOT:-/home/alleone/producao}"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
ECOSYSTEM="$ROOT/deploy/ecosystem.config.cjs"
API_INTERNAL_URL="${ALLEONE_API_INTERNAL_URL:-http://127.0.0.1:3002/api}"
API_HEALTH_URL="${ALLEONE_API_HEALTH_URL:-http://127.0.0.1:3002/api/health}"
WEB_URL="${ALLEONE_WEB_URL:-http://127.0.0.1:3000/login}"

# shellcheck source=lib/deploy-common.sh
source "$ROOT/deploy/scripts/lib/deploy-common.sh"

if [[ "$(whoami)" != "alleone" ]]; then
  echo "AVISO: rode como usuário alleone (atual: $(whoami))"
fi

BRANCH="${ALLEONE_BRANCH:-feat/cutover-tiflux-hardening-20260727}"

cd "$ROOT"
echo "==> git pull ($ROOT) branch=$BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull origin "$BRANCH"
git log -1 --oneline

cd "$BACKEND"
echo "==> backend: npm ci (inclui devDependencies para nest build)"
npm ci --include=dev

echo "==> prisma generate + migrate deploy"
./node_modules/.bin/prisma generate
./node_modules/.bin/prisma migrate deploy

echo "==> backend: npm run build"
npm run build

verify_backend_ready "$BACKEND"

cd "$FRONTEND"
echo "==> frontend: npm ci (inclui devDependencies para o build)"
npm ci --include=dev

ENV_PROD="$FRONTEND/.env.production"
if [[ -f "$ENV_PROD" ]]; then
  api_pub="$(grep -E '^NEXT_PUBLIC_API_URL=' "$ENV_PROD" | head -1 | cut -d= -f2- | sed -e "s/^['\"]//" -e "s/['\"]$//" -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  if [[ -n "$api_pub" && "$api_pub" != */api ]]; then
    echo "AVISO: NEXT_PUBLIC_API_URL sem sufixo /api ($api_pub)"
    echo "       Corrija em $ENV_PROD (ex.: ${api_pub%/}/api) e rode o build de novo."
  fi
fi

echo "==> frontend: npm run build (API_INTERNAL_URL=$API_INTERNAL_URL)"
export API_INTERNAL_URL
npm run build

echo "==> pm2 API + Web (cluster / env atualizado)"
pm2 stop alleone-api alleone-web 2>/dev/null || true
restart_pm2_app "$ECOSYSTEM" alleone-api
restart_pm2_app "$ECOSYSTEM" alleone-web

wait_api_health "$API_HEALTH_URL" alleone-api

echo "==> health Web ($WEB_URL)"
curl -sf -o /dev/null -w "web:%{http_code}\n" "$WEB_URL" || true

echo ""
echo "==> smoke rotas portal (produção)"
if [[ -f "$ROOT/deploy/scripts/smoke-portal-routes.sh" ]]; then
  PORTAL_BASE="${ALLEONE_PORTAL_BASE:-https://alleone.alletecnologia.com}" \
    API_PREFIX="${ALLEONE_API_PREFIX:-/api}" \
    bash "$ROOT/deploy/scripts/smoke-portal-routes.sh" || {
      echo "AVISO: smoke-portal-routes falhou — verifique Nginx e NEXT_PUBLIC_API_URL"
    }
fi

echo ""
echo "Próximo passo (outro usuário com sudo), se Nginx mudou:"
echo "  sudo cp $ROOT/deploy/nginx-alleone-https.conf /etc/nginx/sites-available/alleone"
echo "  sudo nginx -t && sudo systemctl reload nginx"
echo "  (headers/CSP: snippets em $ROOT/deploy/nginx-alleone-*.snippet.conf)"
echo "Revisar .env: $ROOT/deploy/POS_DEPLOY_OPERACIONAL.md (Parte C)"
