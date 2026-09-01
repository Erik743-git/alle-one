#!/usr/bin/env bash
# Funções compartilhadas pelos scripts pos-deploy (produção e teste).
set -euo pipefail

verify_backend_ready() {
  local backend_dir="${1:?caminho do backend}"
  cd "$backend_dir"

  if [[ ! -f dist/src/main.js ]]; then
    echo "ERRO: dist/src/main.js ausente — rode npm run build no backend."
    exit 1
  fi

  node -e "
const client = require('@prisma/client');
if (!client.PermissionModule || typeof client.PermissionModule !== 'object') {
  console.error('ERRO: @prisma/client incompleto (PermissionModule ausente).');
  console.error('Rode: ./node_modules/.bin/prisma generate && npm run build');
  process.exit(1);
}
const count = Object.keys(client.PermissionModule).length;
if (count < 1) {
  console.error('ERRO: PermissionModule vazio.');
  process.exit(1);
}
console.log('OK prisma client —', count, 'módulos em PermissionModule');
"

  echo "OK backend build — dist/src/main.js"
}

wait_api_health() {
  local health_url="${1:?URL de health}"
  local pm2_name="${2:-api}"
  local alt_health="${health_url%/api/health}/health"
  local ok=0

  # Cluster PM2: workers levam alguns segundos após restart.
  sleep 8

  for _i in $(seq 1 35); do
    if curl -sf --max-time 5 "$health_url" >/dev/null; then
      echo "API OK ($health_url)"
      ok=1
      break
    fi
    if [[ "$alt_health" != "$health_url" ]] && curl -sf --max-time 5 "$alt_health" >/dev/null; then
      echo "API OK via $alt_health"
      ok=1
      break
    fi
    sleep 2
  done

  if [[ "$ok" -ne 1 ]]; then
    echo "ERRO: API health falhou após espera (pm2 logs $pm2_name --lines 40)"
    echo "      Teste manual: curl -s $health_url"
    pm2 logs "$pm2_name" --lines 40 --nostream 2>/dev/null || true
    exit 1
  fi
}

restart_pm2_app() {
  local ecosystem="${1:?ecosystem.cjs}"
  local app_name="${2:?nome PM2}"
  pm2 delete "$app_name" 2>/dev/null || true
  pm2 start "$ecosystem" --only "$app_name" --update-env
}
