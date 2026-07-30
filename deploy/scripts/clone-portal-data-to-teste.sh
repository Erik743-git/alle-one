#!/usr/bin/env bash
# Alle One — copia SÓ DADOS (linhas) de portal → portal_teste.
# O schema de portal_teste continua o das migrations do código de teste
# (igual local após prisma migrate), não o DDL “congelado” de prod.
#
# Uso:
#   bash deploy/scripts/clone-portal-data-to-teste.sh
#   # confirme: SIM
#
# NÃO altera produção. Em portal_teste: TRUNCATE + restore data-only.
set -euo pipefail

PROD_ENV="${PROD_ENV:-/home/alleone/producao/backend/.env}"
TESTE_ENV="${TESTE_ENV:-/home/alleone/teste/backend/.env}"
SOURCE_DB="${SOURCE_DB:-portal}"
TARGET_DB="${TARGET_DB:-portal_teste}"
PG_USER="${PG_USER:-uportal}"
PG_HOST="${PG_HOST:-127.0.0.1}"
BACKUP_DIR="${BACKUP_DIR:-/home/alleone/backups/postgres}"
STAMP="$(date +%Y%m%d_%H%M%S)"
DUMP_FILE="${DUMP_FILE:-$BACKUP_DIR/data_${SOURCE_DB}_to_${TARGET_DB}_${STAMP}.sql.gz}"

# Tabelas de app (public) — ajuste se precisar incluir mais.
# Ordem não importa no dump; no restore usamos TRUNCATE CASCADE.
INCLUDE_TABLES=(
  users
  companies
  service_desks
  service_desk_classifications
  user_service_desks
  portal_tickets
  portal_ticket_descriptions
  portal_ticket_appointments
  portal_ticket_appointment_attachments
  portal_ticket_gmud_links
  pre_tickets
  pre_ticket_attachments
  ticket_stages
  audit_logs
)

read_db_url() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "ERRO: .env não encontrado: $file" >&2
    exit 1
  fi
  grep -E '^DATABASE_URL=' "$file" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"
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
      schema=*|connection_limit=*|pool_timeout=*|connect_timeout=*|pgbouncer=*|socket_timeout=*)
        continue
        ;;
      "")
        continue
        ;;
      *)
        if [[ -n "$kept" ]]; then kept+="&"; fi
        kept+="$part"
        ;;
    esac
  done
  if [[ -n "$kept" ]]; then
    printf '%s?%s\n' "$base" "$kept"
  else
    printf '%s\n' "$base"
  fi
}

echo "==> Modo: DATA-ONLY (linhas), schema do teste preservado"
echo "==> Fonte:  $SOURCE_DB"
echo "==> Destino: $TARGET_DB"
echo "==> Dump:   $DUMP_FILE"
echo ""
echo "Isso NÃO recria tabelas. Faz TRUNCATE nas tabelas listadas e importa os dados de prod."
echo ""
read -r -p "Confirma copiar DADOS $SOURCE_DB → $TARGET_DB? [digite SIM] " CONFIRM
if [[ "$CONFIRM" != "SIM" ]]; then
  echo "Abortado."
  exit 1
fi

PROD_URL="$(libpq_url "$(read_db_url "$PROD_ENV")")"
TESTE_URL="$(libpq_url "$(read_db_url "$TESTE_ENV")")"

mkdir -p "$BACKUP_DIR"

echo "==> Parando API de teste"
if id alleone >/dev/null 2>&1; then
  sudo -u alleone -H pm2 stop alleone-teste-api 2>/dev/null || true
else
  pm2 stop alleone-teste-api 2>/dev/null || true
fi

echo "==> Garantindo schema do código em $TARGET_DB (migrate deploy)"
(
  cd /home/alleone/teste/backend
  if id alleone >/dev/null 2>&1; then
    sudo -u alleone -H bash -lc 'cd /home/alleone/teste/backend && npx prisma migrate deploy'
  else
    npx prisma migrate deploy
  fi
) || {
  echo "ERRO: migrate deploy falhou — schema do teste precisa estar alinhado ao código."
  exit 1
}

# Descobrir quais das tabelas existem nos dois lados
EXISTING=()
for t in "${INCLUDE_TABLES[@]}"; do
  src_ok="$(psql "$PROD_URL" -Atc "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='$t'" || true)"
  dst_ok="$(psql "$TESTE_URL" -Atc "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='$t'" || true)"
  if [[ "$src_ok" == "1" && "$dst_ok" == "1" ]]; then
    EXISTING+=("$t")
  else
    echo "AVISO: pulando '$t' (não existe em fonte e/ou destino)"
  fi
done

if [[ ${#EXISTING[@]} -eq 0 ]]; then
  echo "ERRO: nenhuma tabela em comum para copiar."
  exit 1
fi

echo "==> Tabelas a copiar (${#EXISTING[@]}): ${EXISTING[*]}"

DUMP_ARGS=()
for t in "${EXISTING[@]}"; do
  DUMP_ARGS+=(--table="public.$t")
done

echo "==> Dump data-only de $SOURCE_DB"
pg_dump "$PROD_URL" \
  --data-only \
  --no-owner \
  --no-acl \
  --disable-triggers \
  "${DUMP_ARGS[@]}" \
  | gzip -9 > "$DUMP_FILE"
echo "OK ($(du -h "$DUMP_FILE" | awk '{print $1}'))"

echo "==> TRUNCATE CASCADE no destino"
TRUNCATE_LIST="$(printf 'public.%s,' "${EXISTING[@]}" | sed 's/,$//')"
psql "$TESTE_URL" -v ON_ERROR_STOP=1 -c "TRUNCATE TABLE $TRUNCATE_LIST RESTART IDENTITY CASCADE;"

echo "==> Restore data-only em $TARGET_DB"
gunzip -c "$DUMP_FILE" | psql "$TESTE_URL" -v ON_ERROR_STOP=1

echo "==> Contagens (destino)"
for t in portal_tickets users companies service_desks portal_ticket_appointments; do
  if printf '%s\n' "${EXISTING[@]}" | grep -qx "$t"; then
    c="$(psql "$TESTE_URL" -Atc "SELECT count(*) FROM public.$t")"
    echo "  $t = $c"
  fi
done

echo "==> Subindo API de teste"
if id alleone >/dev/null 2>&1; then
  sudo -u alleone -H pm2 start alleone-teste-api 2>/dev/null \
    || sudo -u alleone -H pm2 restart alleone-teste-api 2>/dev/null \
    || true
else
  pm2 start alleone-teste-api 2>/dev/null || pm2 restart alleone-teste-api 2>/dev/null || true
fi

echo ""
echo "Concluído: dados de $SOURCE_DB → $TARGET_DB (schema do teste intacto)."
echo "Dump: $DUMP_FILE"
