#!/usr/bin/env bash
# Alle One — pós-deploy TESTE (pull + migrate + build + restart)
# Espelho de pos-deploy-alleone.sh para /home/alleone/teste
#
# Uso (usuário alleone):
#   bash /home/alleone/teste/deploy/scripts/pos-deploy-alleone-teste.sh
#
# Ou:
#   ALLEONE_ROOT=/home/alleone/teste bash deploy/scripts/pos-deploy-alleone-teste.sh
set -euo pipefail

ROOT="${ALLEONE_ROOT:-/home/alleone/teste}"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
API_NAME="${ALLEONE_API_NAME:-alleone-teste-api}"
WEB_NAME="${ALLEONE_WEB_NAME:-alleone-teste-web}"
API_HEALTH_URL="${ALLEONE_API_HEALTH_URL:-http://127.0.0.1:3004/api/health}"
WEB_URL="${ALLEONE_WEB_URL:-http://127.0.0.1:3001/login}"

if [[ "$(whoami)" != "alleone" ]]; then
  echo "AVISO: rode como usuário alleone (atual: $(whoami))"
fi

if [[ "$ROOT" == *"/producao"* ]]; then
  echo "ERRO: este script é só para TESTE. Não use em produção."
  exit 1
fi

cd "$ROOT"
echo "==> git pull ($ROOT)"
git pull

cd "$BACKEND"
echo "==> backend: npm ci"
npm ci

echo "==> prisma generate"
./node_modules/.bin/prisma generate

# Postgres exige COMMIT entre ADD VALUE de enum e uso no UPDATE.
# Script idempotente — seguro se os valores já existirem.
if [[ -f "$BACKEND/scripts/add-client-roles-enum.sql" ]]; then
  echo "==> enum UserRole CLIENT_* (pré-migrate)"
  if command -v psql >/dev/null 2>&1; then
    set -a
    # shellcheck disable=SC1091
    source <(grep -E '^(DATABASE_URL)=' "$BACKEND/.env" | sed 's/\r$//')
    set +a
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$BACKEND/scripts/add-client-roles-enum.sql" || {
      echo "AVISO: falha ao aplicar enum (pode já existir). Seguindo migrate…"
    }
  else
    echo "AVISO: psql não encontrado — se migrate falhar em UserRole, rode scripts/add-client-roles-enum.sql manualmente."
  fi
fi

echo "==> prisma migrate deploy"
./node_modules/.bin/prisma migrate deploy

echo "==> backend: npm run build"
npm run build

cd "$FRONTEND"
echo "==> frontend: npm ci"
npm ci

echo "==> frontend: npm run build"
npm run build

echo "==> pm2 restart $API_NAME $WEB_NAME"
pm2 restart "$API_NAME" "$WEB_NAME" --update-env

sleep 5
echo "==> health API ($API_HEALTH_URL)"
if ! curl -sf "$API_HEALTH_URL" >/dev/null; then
  # fallback sem prefixo /api (alguns .env locais)
  ALT_HEALTH="${API_HEALTH_URL%/api/health}/health"
  if [[ "$ALT_HEALTH" != "$API_HEALTH_URL" ]] && curl -sf "$ALT_HEALTH" >/dev/null; then
    echo "API OK via $ALT_HEALTH"
  else
    echo "ERRO: API health falhou (pm2 logs $API_NAME --lines 30)"
    exit 1
  fi
else
  echo "API OK"
fi

echo "==> health Web ($WEB_URL)"
curl -sf -o /dev/null -w "web:%{http_code}\n" "$WEB_URL" || true

echo ""
echo "OK — teste atualizado."
echo "Público: https://alleone-teste.alletecnologia.com"
echo "Se Nginx de teste mudou (sudo em outro usuário):"
echo "  sudo cp $ROOT/deploy/nginx-alleone-teste-https.conf /etc/nginx/sites-available/alleone-teste"
echo "  sudo nginx -t && sudo systemctl reload nginx"
