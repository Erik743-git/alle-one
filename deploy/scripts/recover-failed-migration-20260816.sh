#!/usr/bin/env bash
# Recupera falha P3018 da migration 20260816120000 (default TEXT → enum).
set -euo pipefail

ROOT="${ALLEONE_ROOT:-/home/alleone/producao}"
BACKEND="$ROOT/backend"

cd "$ROOT"
echo "==> git pull (migration corrigida)"
git pull

cd "$BACKEND"
echo "==> marcar migration como rolled-back"
./node_modules/.bin/prisma migrate resolve --rolled-back 20260816120000_report_enums_refresh_token_drop

echo "==> reaplicar migrations"
./node_modules/.bin/prisma generate
./node_modules/.bin/prisma migrate deploy

echo "==> build + restart API"
npm run build
pm2 restart alleone-api

sleep 3
curl -sf "http://127.0.0.1:3002/health" && echo "" && echo "API OK"
