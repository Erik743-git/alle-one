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

db_from_env_file() {
  local file="$1"
  db_name_from_url "$(strip_prisma_query "$(read_env_var "$file" DATABASE_URL)")"
}

pm2_injected_db() {
  local pm2_name="$1"
  pm2 jlist 2>/dev/null | node -e "
    let s = '';
    process.stdin.on('data', (d) => { s += d; });
    process.stdin.on('end', () => {
      const list = JSON.parse(s || '[]');
      const proc = list.find((p) => p.name === process.argv[1]);
      if (!proc) process.exit(2);
      const env = proc.pm2_env?.env ?? {};
      const url = env.DATABASE_URL ?? proc.pm2_env?.DATABASE_URL;
      if (!url) process.exit(3);
      console.log(url.split('/').pop().split('?')[0]);
    });
  " "$pm2_name" 2>/dev/null || true
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

  local db
  db="$(db_from_env_file "$file")"

  if [[ "$db" != "$expected_db" ]]; then
    echo "ERRO [$label] banco=$db (esperado: $expected_db) — $file"
    fail=1
  else
    echo "OK   [$label] .env banco=$db"
  fi
}

check_pm2_db() {
  local label="$1"
  local pm2_name="$2"
  local expected_db="$3"

  if ! command -v pm2 >/dev/null 2>&1 || ! pm2 describe "$pm2_name" >/dev/null 2>&1; then
    echo "AVISO [$label] processo PM2 ausente: $pm2_name"
    return
  fi

  local injected
  injected="$(pm2_injected_db "$pm2_name")"
  if [[ -z "$injected" ]]; then
    echo "OK   [$label] PM2 sem DATABASE_URL (runtime lê o .env → $expected_db)"
    return
  fi

  if [[ "$injected" != "$expected_db" ]]; then
    echo "ERRO [$label] PM2 injeta DATABASE_URL=$injected (esperado: $expected_db ou ausente)"
    fail=1
  else
    echo "OK   [$label] PM2 DATABASE_URL=$injected"
  fi
}

echo "==> Separação prod / teste"

if [[ -n "${DATABASE_URL:-}" ]]; then
  shell_db="$(db_name_from_url "$(strip_prisma_query "$DATABASE_URL")")"
  echo "AVISO: DATABASE_URL exportada no shell: $shell_db"
  echo "       dotenv e 'pm2 restart --update-env' NÃO sobrescrevem variáveis já definidas."
  echo "       Rode: unset DATABASE_URL"
  echo ""
fi

check_env "PROD backend" "$PROD_ENV" "portal"
check_env "TESTE backend" "$TESTE_ENV" "portal_teste"

if [[ -f "$SYNC_ENV" ]]; then
  check_env "TIFLUX-SYNC (prod)" "$SYNC_ENV" "portal"
else
  echo "AVISO [TIFLUX-SYNC] .env ausente: $SYNC_ENV"
fi

echo ""
echo "==> Runtime PM2 (DATABASE_URL injetada no processo)"
check_pm2_db "PROD API" "alleone-api" "portal"
check_pm2_db "TESTE API" "alleone-teste-api" "portal_teste"
check_pm2_db "TIFLUX-SYNC" "alleone-tiflux-sync" "portal"

echo ""
if [[ "$fail" -ne 0 ]]; then
  echo "FALHOU — corrija os .env e/ou recrie processos PM2 sem DATABASE_URL no shell."
  echo "Produção NUNCA deve usar portal_teste."
  echo ""
  echo "Correção típica:"
  echo "  unset DATABASE_URL"
  echo "  cd /home/alleone/producao"
  echo "  pm2 delete alleone-api 2>/dev/null; pm2 start deploy/ecosystem.config.cjs --only alleone-api"
  echo "  pm2 save"
  exit 1
fi

echo "OK — ambientes separados corretamente."
