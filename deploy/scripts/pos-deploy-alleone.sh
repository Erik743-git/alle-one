#!/usr/bin/env bash
# Alle One — pós-deploy (usuário alleone): pull + migrate + build API + web + restart
set -euo pipefail

ROOT="${ALLEONE_ROOT:-/home/alleone/producao}"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

if [[ "$(whoami)" != "alleone" ]]; then
  echo "AVISO: rode como usuário alleone (atual: $(whoami))"
fi

cd "$ROOT"
echo "==> git pull"
git pull

cd "$BACKEND"
echo "==> backend: npm ci"
npm ci

echo "==> prisma generate + migrate deploy"
./node_modules/.bin/prisma generate
./node_modules/.bin/prisma migrate deploy

echo "==> backend: npm run build"
npm run build

cd "$FRONTEND"
echo "==> frontend: npm ci"
npm ci

echo "==> frontend: npm run build"
npm run build

echo "==> pm2 API (cluster, 2 instâncias)"
pm2 delete alleone-api 2>/dev/null || true
pm2 start "$ROOT/deploy/ecosystem.config.cjs" --only alleone-api --update-env
pm2 restart alleone-web --update-env

sleep 3
echo "==> health API"
if ! curl -sf "http://127.0.0.1:3002/api/health" >/dev/null; then
  echo "ERRO: API health falhou (verifique DB e pm2 logs alleone-api --lines 30)"
  exit 1
fi
echo "API OK"

echo "==> health Web"
curl -sf -o /dev/null -w "web:%{http_code}\n" "http://127.0.0.1:3000/login" || true

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
