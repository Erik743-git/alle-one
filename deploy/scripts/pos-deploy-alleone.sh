#!/usr/bin/env bash
# Alle One — pós-deploy (usuário alleone): migrate + build API + restart
set -euo pipefail

ROOT="${ALLEONE_ROOT:-/home/alleone/producao}"
BACKEND="$ROOT/backend"

if [[ "$(whoami)" != "alleone" ]]; then
  echo "AVISO: rode como usuário alleone (atual: $(whoami))"
fi

cd "$ROOT"
echo "==> git pull"
git pull

cd "$BACKEND"
echo "==> npm ci"
npm ci

echo "==> prisma generate + migrate deploy"
./node_modules/.bin/prisma generate
./node_modules/.bin/prisma migrate deploy

echo "==> npm run build (API)"
npm run build

echo "==> pm2 restart alleone-api"
pm2 restart alleone-api

sleep 2
echo "==> health"
curl -sf "http://127.0.0.1:3002/health" >/dev/null && echo "API OK" || echo "API FALHOU — veja: pm2 logs alleone-api --lines 30"

echo ""
echo "Próximo passo (outro usuário com sudo):"
echo "  sudo cp $ROOT/deploy/nginx-alleone-https.conf /etc/nginx/sites-available/alleone"
echo "  sudo nginx -t && sudo systemctl reload nginx"
echo "Revisar .env: $ROOT/deploy/POS_DEPLOY_OPERACIONAL.md (Parte C)"
