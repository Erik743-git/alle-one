#!/usr/bin/env bash
# Verificação operacional Alle One (cron ou manual)
set -euo pipefail

BASE_URL="${ALLEONE_HEALTH_URL:-https://alleone.alletecnologia.com}"
API_PREFIX="${ALLEONE_API_PREFIX:-}"
HEALTH_PATH="${API_PREFIX}/health"
INTEGRATIONS_PATH="${API_PREFIX}/health/integrations"

echo "==> Health API: ${BASE_URL}${HEALTH_PATH}"
HTTP_CODE="$(curl -sS -o /tmp/alleone-health.json -w "%{http_code}" "${BASE_URL}${HEALTH_PATH}" || echo "000")"
echo "HTTP ${HTTP_CODE}"
cat /tmp/alleone-health.json 2>/dev/null || true
echo

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "FALHA: health não retornou 200"
  exit 1
fi

echo "==> Integrações: ${BASE_URL}${INTEGRATIONS_PATH}"
curl -sS "${BASE_URL}${INTEGRATIONS_PATH}" | head -c 2000
echo

echo "==> PM2 (se disponível)"
if command -v pm2 >/dev/null 2>&1; then
  pm2 jlist 2>/dev/null | head -c 1500 || pm2 status
else
  echo "pm2 não encontrado neste host"
fi

echo "==> Disco"
df -h / | tail -1

echo "OK"
