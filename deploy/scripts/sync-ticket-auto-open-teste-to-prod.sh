#!/usr/bin/env bash
# Copia regras de abertura automática de portal_teste → portal (produção).
#
# Uso na VM:
#   bash /home/alleone/producao/deploy/scripts/sync-ticket-auto-open-teste-to-prod.sh
#   bash .../sync-ticket-auto-open-teste-to-prod.sh --dry-run
#
set -euo pipefail

PROD_ROOT="${PROD_ROOT:-/home/alleone/producao}"
TESTE_ROOT="${TESTE_ROOT:-/home/alleone/teste}"
EXPORT_FILE="${EXPORT_FILE:-/tmp/ticket-auto-open-rules.json}"
CREATED_BY_EMAIL="${CREATED_BY_EMAIL:-erik.manarin@alletecnologia.com}"
DRY_RUN="${DRY_RUN:-}"

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="--dry-run"
fi

read_db_url() {
  local file="$1"
  grep -E '^DATABASE_URL=' "$file" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"
}

strip_prisma_query() {
  local url="$1"
  if [[ "$url" != *"?"* ]]; then
    printf '%s\n' "$url"
    return
  fi
  printf '%s\n' "${url%%\?*}"
}

PROD_ENV="$PROD_ROOT/backend/.env"
TESTE_ENV="$TESTE_ROOT/backend/.env"
SCRIPT_REL="prisma/scripts/sync-ticket-auto-open-rules.ts"

if [[ ! -f "$PROD_ENV" || ! -f "$TESTE_ENV" ]]; then
  echo "ERRO: .env de prod ou teste não encontrado." >&2
  exit 1
fi

if [[ ! -f "$PROD_ROOT/backend/$SCRIPT_REL" ]]; then
  echo "ERRO: script não encontrado em produção: $PROD_ROOT/backend/$SCRIPT_REL" >&2
  echo "Execute: cd $PROD_ROOT && git pull" >&2
  exit 1
fi

echo "==> Exportando regras de teste (script em produção, banco de teste)"
(
  cd "$PROD_ROOT/backend"
  export DATABASE_URL="$(strip_prisma_query "$(read_db_url "$TESTE_ENV")")"
  npx ts-node "$SCRIPT_REL" export --out="$EXPORT_FILE"
)

echo ""
echo "==> Importando em produção ${DRY_RUN:-}"
(
  cd "$PROD_ROOT/backend"
  export DATABASE_URL="$(strip_prisma_query "$(read_db_url "$PROD_ENV")")"
  npx ts-node "$SCRIPT_REL" import \
    --file="$EXPORT_FILE" \
    --created-by-email="$CREATED_BY_EMAIL" \
    $DRY_RUN
)

echo ""
echo "Concluído. Arquivo exportado: $EXPORT_FILE"
