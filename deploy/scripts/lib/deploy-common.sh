#!/usr/bin/env bash
# Funções compartilhadas pelos scripts pos-deploy (produção e teste).
set -euo pipefail

# Lê uma variável do .env sem fazer source (evita quebrar com aspas/backticks no arquivo).
read_env_var() {
  local file="${1:?arquivo .env}"
  local key="${2:?nome da variável}"
  grep -E "^${key}=" "$file" | head -1 | cut -d= -f2- | sed 's/\r$//' | sed -e "s/^['\"]//" -e "s/['\"]$//"
}

strip_prisma_query() {
  local url="$1"
  if [[ "$url" != *"?"* ]]; then
    printf '%s\n' "$url"
    return
  fi
  printf '%s\n' "${url%%\?*}"
}

load_database_url() {
  local env_file="${1:?arquivo .env}"
  if [[ ! -f "$env_file" ]]; then
    echo "ERRO: .env não encontrado: $env_file"
    exit 1
  fi
  DATABASE_URL="$(strip_prisma_query "$(read_env_var "$env_file" DATABASE_URL)")"
  if [[ -z "$DATABASE_URL" ]]; then
    echo "ERRO: DATABASE_URL ausente em $env_file"
    exit 1
  fi
  export DATABASE_URL
}

apply_tiflux_mirror_content_sql() {
  local env_file="${1:?arquivo .env}"
  local sql_file="${2:?arquivo .sql}"
  if [[ ! -f "$sql_file" ]]; then
    echo "ERRO: SQL espelho não encontrado: $sql_file"
    exit 1
  fi
  echo "==> SQL espelho tiflux (description + ticket_files)"
  load_database_url "$env_file"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$sql_file"
}

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
