#!/usr/bin/env bash
# Verificação operacional Alle One (cron ou manual)
set -euo pipefail

BASE_URL="${ALLEONE_HEALTH_URL:-https://alleone.alletecnologia.com}"
API_PREFIX="${ALLEONE_API_PREFIX:-}"
HEALTH_PATH="${API_PREFIX}/health"
INTEGRATIONS_PATH="${API_PREFIX}/health/integrations"
# Mesmo valor de HEALTH_INTEGRATIONS_TOKEN no backend
INTERNAL_TOKEN="${HEALTH_INTEGRATIONS_TOKEN:-}"

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
CURL_HEADERS=()
if [[ -n "$INTERNAL_TOKEN" ]]; then
  CURL_HEADERS+=(-H "X-Internal-Health-Token: ${INTERNAL_TOKEN}")
fi
INTEGRATIONS_CODE="$(curl -sS -o /tmp/alleone-integrations.json -w "%{http_code}" "${CURL_HEADERS[@]}" "${BASE_URL}${INTEGRATIONS_PATH}" || echo "000")"
echo "HTTP ${INTEGRATIONS_CODE}"
head -c 2000 /tmp/alleone-integrations.json 2>/dev/null || true
echo

if [[ "$INTEGRATIONS_CODE" != "200" ]]; then
  echo "FALHA: health/integrations não retornou 200 (defina HEALTH_INTEGRATIONS_TOKEN ou use sessão ADMIN)"
  exit 1
fi

echo "==> PM2 (se disponível)"
if command -v pm2 >/dev/null 2>&1; then
  pm2 jlist 2>/dev/null | head -c 1500 || pm2 status
else
  echo "pm2 não encontrado neste host"
fi

echo "==> Disco"
df -h / | tail -1

echo "OK"
