#!/usr/bin/env bash
# Alle One — clona o banco de produção (portal) → portal_teste na mesma VM.
#
# Uso (como usuário com acesso ao Postgres, tipicamente ubuntu com sudo):
#   bash deploy/scripts/clone-portal-to-teste.sh
#
# Variáveis opcionais:
#   PROD_ENV=/home/alleone/producao/backend/.env
#   TESTE_ENV=/home/alleone/teste/backend/.env
#   SOURCE_DB=portal
#   TARGET_DB=portal_teste
#   PG_USER=uportal
#
# NÃO altera o banco de produção. É destrutivo apenas em portal_teste.
set -euo pipefail

PROD_ENV="${PROD_ENV:-/home/alleone/producao/backend/.env}"
TESTE_ENV="${TESTE_ENV:-/home/alleone/teste/backend/.env}"
SOURCE_DB="${SOURCE_DB:-portal}"
TARGET_DB="${TARGET_DB:-portal_teste}"
PG_USER="${PG_USER:-uportal}"
PG_HOST="${PG_HOST:-127.0.0.1}"
BACKUP_DIR="${BACKUP_DIR:-/home/alleone/backups/postgres}"
STAMP="$(date +%Y%m%d_%H%M%S)"
DUMP_FILE="${DUMP_FILE:-$BACKUP_DIR/clone_${SOURCE_DB}_to_${TARGET_DB}_${STAMP}.sql.gz}"

if [[ "$(id -u)" -eq 0 ]]; then
  echo "Não rode como root puro se puder evitar; prefira ubuntu/alleone com peer auth."
fi

read_db_url() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "ERRO: .env não encontrado: $file" >&2
    exit 1
  fi
  grep -E '^DATABASE_URL=' "$file" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"
}

echo "==> Fonte:  $SOURCE_DB (prod)"
echo "==> Destino: $TARGET_DB (teste) — será recriado"
echo "==> Dump:   $DUMP_FILE"
echo ""
read -r -p "Confirma clonar $SOURCE_DB → $TARGET_DB? [digite SIM] " CONFIRM
if [[ "$CONFIRM" != "SIM" ]]; then
  echo "Abortado."
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "==> Parando API de teste (se existir)"
if command -v pm2 >/dev/null 2>&1; then
  pm2 stop alleone-teste-api 2>/dev/null || true
fi

echo "==> Dump de $SOURCE_DB"
# Prefer DATABASE_URL de prod (senha já correta); fallback peer/local
if [[ -f "$PROD_ENV" ]]; then
  PROD_URL="$(read_db_url "$PROD_ENV")"
  pg_dump "$PROD_URL" --no-owner --no-acl | gzip -9 > "$DUMP_FILE"
else
  pg_dump -h "$PG_HOST" -U "$PG_USER" -d "$SOURCE_DB" --no-owner --no-acl | gzip -9 > "$DUMP_FILE"
fi
echo "OK ($(du -h "$DUMP_FILE" | awk '{print $1}'))"

echo "==> Recriando $TARGET_DB"
# drop/create: tenta via peer (postgres) ou via URL de teste
if command -v sudo >/dev/null 2>&1 && id postgres >/dev/null 2>&1; then
  sudo -u postgres dropdb --if-exists "$TARGET_DB"
  sudo -u postgres createdb -O "$PG_USER" "$TARGET_DB"
else
  dropdb -h "$PG_HOST" -U "$PG_USER" --if-exists "$TARGET_DB"
  createdb -h "$PG_HOST" -U "$PG_USER" -O "$PG_USER" "$TARGET_DB"
fi

echo "==> Restore em $TARGET_DB"
if [[ -f "$TESTE_ENV" ]]; then
  TESTE_URL="$(read_db_url "$TESTE_ENV")"
  gunzip -c "$DUMP_FILE" | psql "$TESTE_URL" -v ON_ERROR_STOP=1
else
  gunzip -c "$DUMP_FILE" | psql -h "$PG_HOST" -U "$PG_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1
fi

echo "==> Ajustando ownership (se necessário)"
if command -v sudo >/dev/null 2>&1 && id postgres >/dev/null 2>&1; then
  sudo -u postgres psql -d "$TARGET_DB" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT format('ALTER TABLE %I.%I OWNER TO %I', schemaname, tablename, '$PG_USER')
    FROM pg_tables
    WHERE schemaname IN ('public', 'tiflux')
  LOOP
    EXECUTE r.format;
  END LOOP;
END
\$\$;
SQL
fi

if [[ -d /home/alleone/teste/backend ]]; then
  echo "==> prisma migrate deploy (código de teste)"
  (
    cd /home/alleone/teste/backend
    npx prisma migrate deploy
  ) || echo "AVISO: migrate deploy falhou — rode manualmente se o schema do teste diferir."
fi

echo "==> Subindo API de teste"
if command -v pm2 >/dev/null 2>&1; then
  pm2 start alleone-teste-api 2>/dev/null || pm2 restart alleone-teste-api 2>/dev/null || true
fi

echo ""
echo "Concluído: $SOURCE_DB → $TARGET_DB"
echo "Dump guardado em: $DUMP_FILE"
echo "Smoke: login em https://alleone-teste.alletecnologia.com + listar tickets/mesas"
