#!/usr/bin/env bash
# Recuperação emergencial — recria APIs PM2 SEM DATABASE_URL injetada no processo.
# O Nest lê o .env do cwd; variável exportada no shell ou no PM2 sobrescreve o arquivo.
#
# Uso (na VM, como alleone):
#   bash /home/alleone/producao/deploy/scripts/recuperar-apis-pm2.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/deploy-common.sh
source "$SCRIPT_DIR/lib/deploy-common.sh"

PROD_ROOT="${PROD_ROOT:-/home/alleone/producao}"
TESTE_ROOT="${TESTE_ROOT:-/home/alleone/teste}"
PROD_ECOSYSTEM="$PROD_ROOT/deploy/ecosystem.config.cjs"
TESTE_ECOSYSTEM="$TESTE_ROOT/deploy/ecosystem.teste.config.cjs"

unset DATABASE_URL

echo "==> Recuperação PM2 (shell sem DATABASE_URL)"
echo ""

recreate_app() {
  local ecosystem="$1"
  local name="$2"
  echo "==> $name"
  pm2 delete "$name" 2>/dev/null || true
  pm2 start "$ecosystem" --only "$name"
}

restart_web() {
  local name="$1"
  if pm2 describe "$name" >/dev/null 2>&1; then
    pm2 restart "$name"
  fi
}

recreate_app "$PROD_ECOSYSTEM" "alleone-api"
recreate_app "$PROD_ECOSYSTEM" "alleone-tiflux-sync"
recreate_app "$TESTE_ECOSYSTEM" "alleone-teste-api"

restart_web "alleone-web"
restart_web "alleone-teste-web"

pm2 save >/dev/null 2>&1 || true

echo ""
echo "==> Aguardando APIs..."
sleep 8

check_health() {
  local label="$1"
  local url="$2"
  if curl -sf --max-time 8 "$url" >/dev/null; then
    echo "OK   $label — $url"
  else
    echo "FALHA $label — $url"
    return 1
  fi
}

fail=0
check_health "PROD API" "http://127.0.0.1:3002/api/health" || fail=1
check_health "TESTE API" "http://127.0.0.1:3004/api/health" || fail=1

echo ""
pm2 list

if [[ "$fail" -ne 0 ]]; then
  echo ""
  echo "Alguma API não subiu. Logs:"
  pm2 logs alleone-api --err --lines 30 --nostream 2>/dev/null || true
  pm2 logs alleone-teste-api --err --lines 30 --nostream 2>/dev/null || true
  exit 1
fi

echo ""
echo "OK — prod e teste recuperados."
