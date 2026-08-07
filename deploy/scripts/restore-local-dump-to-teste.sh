#!/usr/bin/env bash
# Restaura um dump gerado no PC local (Docker alleone) em portal_teste.
# Pré: dump .sql.gz já copiado para a VM (ex.: /tmp/alleone-local.sql.gz)
#
# Uso (como ubuntu, com sudo postgres):
#   DUMP=/tmp/alleone-local.sql.gz bash deploy/scripts/restore-local-dump-to-teste.sh
#
# NÃO usa banco de produção. Destino: só portal_teste.
set -euo pipefail

DUMP="${DUMP:-/tmp/alleone-local.sql.gz}"
TESTE_ENV="${TESTE_ENV:-/home/alleone/teste/backend/.env}"
TARGET_DB="${TARGET_DB:-portal_teste}"
PG_USER="${PG_USER:-uportal}"

if [[ ! -f "$DUMP" ]]; then
  echo "ERRO: dump nao encontrado: $DUMP"
  echo "No PC: docker exec alleone_postgres bash -lc 'pg_dump -U alle -d alleone --no-owner --no-acl -f /tmp/alleone.sql && gzip -f /tmp/alleone.sql'"
  echo "       docker cp alleone_postgres:/tmp/alleone.sql.gz ./alleone-local.sql.gz"
  echo "Depois: scp alleone-local.sql.gz ubuntu@VM:/tmp/"
  exit 1
fi

if ! gzip -t "$DUMP" 2>/dev/null; then
  echo "ERRO: $DUMP nao e gzip valido (arquivo corrompido no scp/PowerShell)."
  echo "Regenere com docker cp (binario) e envie de novo."
  exit 1
fi

read_db_url() {
  grep -E '^DATABASE_URL=' "$1" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"
}

libpq_url() {
  local url="$1"
  if [[ "$url" != *"?"* ]]; then
    printf '%s\n' "$url"
    return
  fi
  local base="${url%%\?*}"
  local qs="${url#*\?}"
  local kept="" part
  IFS='&' read -ra parts <<< "$qs"
  for part in "${parts[@]}"; do
    case "$part" in
      schema=*|connection_limit=*|pool_timeout=*|connect_timeout=*|pgbouncer=*|socket_timeout=*) continue ;;
      "") continue ;;
      *)
        if [[ -n "$kept" ]]; then kept+="&"; fi
        kept+="$part"
        ;;
    esac
  done
  if [[ -n "$kept" ]]; then printf '%s?%s\n' "$base" "$kept"
  else printf '%s\n' "$base"
  fi
}

TESTE_URL="$(libpq_url "$(read_db_url "$TESTE_ENV")")"
case "$TESTE_URL" in
  */portal_teste*) ;;
  *)
    echo "ERRO: DATABASE_URL de teste nao aponta para portal_teste. Abortando."
    exit 1
    ;;
esac

echo "==> Dump: $DUMP ($(du -h "$DUMP" | awk '{print $1}'))"
echo "==> Destino: $TARGET_DB"
read -r -p "Isso APAGA portal_teste e restaura o dump local. Digite SIM: " CONFIRM
if [[ "$CONFIRM" != "SIM" ]]; then
  echo "Abortado."
  exit 1
fi

if id alleone >/dev/null 2>&1; then
  sudo -u alleone -H pm2 stop alleone-teste-api 2>/dev/null || true
fi

echo "==> Encerrando conexoes + drop/create"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$TARGET_DB' AND pid <> pg_backend_pid();" \
  >/dev/null || true
sudo -u postgres dropdb --if-exists "$TARGET_DB"
sudo -u postgres createdb -O "$PG_USER" "$TARGET_DB"

echo "==> Restore"
gunzip -c "$DUMP" | psql "$TESTE_URL" -v ON_ERROR_STOP=1

echo "==> Contagens"
psql "$TESTE_URL" -c "SELECT count(*) AS portal_tickets FROM portal_tickets;"
psql "$TESTE_URL" -c "SELECT count(*) AS appointments FROM portal_ticket_appointments;"
psql "$TESTE_URL" -c "SELECT count(*) AS users FROM users;"

echo "==> migrate deploy (alleone)"
if id alleone >/dev/null 2>&1; then
  sudo -u alleone -H bash -lc 'cd /home/alleone/teste/backend && npx prisma migrate deploy'
  sudo -u alleone -H pm2 start alleone-teste-api 2>/dev/null \
    || sudo -u alleone -H pm2 restart alleone-teste-api 2>/dev/null \
    || true
fi

echo "OK. Teste = dump local (portal-only)."
