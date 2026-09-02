#!/usr/bin/env bash
# Deploy rapido do frontend Alle One (PWA + UI) na VM
set -euo pipefail

ROOT="${ALLEONE_ROOT:-/home/alleone/producao}"
cd "$ROOT"

echo "==> Git"
git fetch origin
git pull origin main
git log -1 --oneline

echo "==> Frontend build"
cd frontend
npm ci --include=dev
npm run build

echo "==> PM2 restart"
pm2 restart alleone-web
pm2 save

echo "==> Smoke PWA"
curl -sf "https://alleone.alletecnologia.com/manifest.webmanifest" | head -c 200 || true
echo ""
curl -sI "https://alleone.alletecnologia.com/sw.js" | head -3 || true

echo "OK — frontend deployado"
