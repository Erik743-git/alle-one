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

echo "==> pm2 restart"
pm2 restart alleone-api alleone-web

sleep 3
echo "==> health API"
curl -sf "http://127.0.0.1:3002/health" >/dev/null && echo "API OK" || echo "API FALHOU — pm2 logs alleone-api --lines 30"

echo "==> health Web"
curl -sf -o /dev/null -w "web:%{http_code}\n" "http://127.0.0.1:3000/login" || true

echo ""
echo "Próximo passo (outro usuário com sudo), se Nginx mudou:"
echo "  sudo cp $ROOT/deploy/nginx-alleone-https.conf /etc/nginx/sites-available/alleone"
echo "  sudo nginx -t && sudo systemctl reload nginx"
echo "Revisar .env: $ROOT/deploy/POS_DEPLOY_OPERACIONAL.md (Parte C)"
