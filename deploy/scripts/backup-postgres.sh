#!/usr/bin/env bash
# Alle One — backup do Postgres (rodar no servidor como usuário alleone ou via cron)
set -euo pipefail

ROOT="${ALLEONE_ROOT:-/home/alleone/producao}"
BACKUP_DIR="${ALLEONE_BACKUP_DIR:-/home/alleone/backups/postgres}"
RETENTION_DAYS="${ALLEONE_BACKUP_RETENTION_DAYS:-14}"

ENV_FILE="${ALLEONE_ENV_FILE:-$ROOT/backend/.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERRO: .env não encontrado em $ENV_FILE"
  exit 1
fi

# DATABASE_URL=postgresql://user:pass@host:5432/dbname
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
if [[ -z "$DATABASE_URL" ]]; then
  echo "ERRO: DATABASE_URL ausente em $ENV_FILE"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/alleone_${STAMP}.sql.gz"

echo "==> Backup → $OUT"
pg_dump "$DATABASE_URL" | gzip -9 > "$OUT"
echo "OK ($(du -h "$OUT" | awk '{print $1}'))"

echo "==> Limpeza backups com mais de ${RETENTION_DAYS} dias"
find "$BACKUP_DIR" -name 'alleone_*.sql.gz' -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true

echo "Concluído."
