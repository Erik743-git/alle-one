#!/usr/bin/env bash
# Verifica se produção e teste NÃO compartilham o mesmo banco Postgres.
# Rode antes de clone, ETL, deploy de conteúdo ou sync.
#
# Uso:
#   bash /home/alleone/producao/deploy/scripts/verificar-separacao-ambientes.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/deploy-common.sh
source "$SCRIPT_DIR/lib/deploy-common.sh"

PROD_ENV="${PROD_ENV:-/home/alleone/producao/backend/.env}"
TESTE_ENV="${TESTE_ENV:-/home/alleone/teste/backend/.env}"
SYNC_ENV="${SYNC_ENV:-/home/alleone/producao/alleone-tiflux-sync/.env}"

fail=0

db_name_from_url() {
  local url="$1"
  basename "${url%%\?*}"
}

check_env() {
  local label="$1"
  local file="$2"
  local expected_db="$3"

  if [[ ! -f "$file" ]]; then
    echo "ERRO [$label] .env não encontrado: $file"
    fail=1
    return
  fi

  local count
  count="$(grep -cE '^DATABASE_URL=' "$file" 2>/dev/null || true)"
  if [[ "$count" -ne 1 ]]; then
    echo "ERRO [$label] deve ter exatamente 1 linha DATABASE_URL (encontradas: $count) em $file"
    fail=1
    return
  fi

  load_database_url "$file"
  local db
  db="$(db_name_from_url "$DATABASE_URL")"

  if [[ "$db" != "$expected_db" ]]; then
    echo "ERRO [$label] banco=$db (esperado: $expected_db) — $file"
    fail=1
  else
    echo "OK   [$label] banco=$db"
  fi
}

echo "==> Separação prod / teste"
check_env "PROD backend" "$PROD_ENV" "portal"
check_env "TESTE backend" "$TESTE_ENV" "portal_teste"

if [[ -f "$SYNC_ENV" ]]; then
  check_env "TIFLUX-SYNC (prod)" "$SYNC_ENV" "portal"
else
  echo "AVISO [TIFLUX-SYNC] .env ausente: $SYNC_ENV"
fi

echo ""
if [[ "$fail" -ne 0 ]]; then
  echo "FALHOU — corrija os .env antes de rodar clone, ETL ou deploy."
  echo "Produção NUNCA deve usar portal_teste."
  exit 1
fi

echo "OK — ambientes separados corretamente."
