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
ECOSYSTEM="$ROOT/deploy/ecosystem.teste.config.cjs"
API_NAME="${ALLEONE_API_NAME:-alleone-teste-api}"
WEB_NAME="${ALLEONE_WEB_NAME:-alleone-teste-web}"
API_INTERNAL_URL="${ALLEONE_API_INTERNAL_URL:-http://127.0.0.1:3004/api}"
API_HEALTH_URL="${ALLEONE_API_HEALTH_URL:-http://127.0.0.1:3004/api/health}"
WEB_URL="${ALLEONE_WEB_URL:-http://127.0.0.1:3001/login}"

# shellcheck source=lib/deploy-common.sh
source "$ROOT/deploy/scripts/lib/deploy-common.sh"

if [[ "$(whoami)" != "alleone" ]]; then
  echo "AVISO: rode como usuário alleone (atual: $(whoami))"
fi

if [[ "$ROOT" == *"/producao"* ]]; then
  echo "ERRO: este script é só para TESTE. Não use em produção."
  exit 1
fi

cd "$ROOT"
echo "==> git pull ($ROOT)"
git fetch origin
git pull origin feat/cutover-tiflux-hardening-20260727

cd "$BACKEND"
echo "==> backend: npm ci (inclui devDependencies para nest build)"
npm ci --include=dev

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

verify_backend_ready "$BACKEND"

cd "$FRONTEND"
echo "==> frontend: npm ci (inclui devDependencies para o build)"
npm ci --include=dev

echo "==> frontend: npm run build (API_INTERNAL_URL=$API_INTERNAL_URL)"
export API_INTERNAL_URL
npm run build

echo "==> pm2 API + Web (cluster / env atualizado)"
pm2 stop "$API_NAME" "$WEB_NAME" 2>/dev/null || true
restart_pm2_app "$ECOSYSTEM" "$API_NAME"
restart_pm2_app "$ECOSYSTEM" "$WEB_NAME"

wait_api_health "$API_HEALTH_URL" "$API_NAME"

echo "==> health Web ($WEB_URL)"
curl -sf -o /dev/null -w "web:%{http_code}\n" "$WEB_URL" || true

echo ""
echo "==> smoke rotas portal (teste)"
if [[ -f "$ROOT/deploy/scripts/smoke-portal-routes.sh" ]]; then
  PORTAL_BASE="${ALLEONE_PORTAL_BASE:-https://alleone-teste.alletecnologia.com}" \
    API_PREFIX="${ALLEONE_API_PREFIX:-/api}" \
    bash "$ROOT/deploy/scripts/smoke-portal-routes.sh" || {
      echo "AVISO: smoke-portal-routes falhou — verifique Nginx e NEXT_PUBLIC_API_URL"
    }
fi

if [[ -n "${ALLEONE_SMOKE_EMAIL:-}" && -n "${ALLEONE_SMOKE_PASSWORD:-}" ]]; then
  echo ""
  echo "==> smoke autenticado (API tickets + módulos)"
  PORTAL_BASE="${ALLEONE_PORTAL_BASE:-https://alleone-teste.alletecnologia.com}" \
    API_PREFIX="${ALLEONE_API_PREFIX:-/api}" \
    ALLEONE_SMOKE_EMAIL="$ALLEONE_SMOKE_EMAIL" \
    ALLEONE_SMOKE_PASSWORD="$ALLEONE_SMOKE_PASSWORD" \
    ALLEONE_SMOKE_TOTP="${ALLEONE_SMOKE_TOTP:-}" \
    ALLEONE_SMOKE_COOKIE_JAR="${ALLEONE_SMOKE_COOKIE_JAR:-$HOME/.alleone-smoke-cookies}" \
    SMOKE_TICKETS_WRITE="${SMOKE_TICKETS_WRITE:-0}" \
    bash "$ROOT/deploy/scripts/smoke-portal-authenticated.sh" || {
      echo "AVISO: smoke-portal-authenticated falhou — revise credenciais/2FA"
    }
else
  echo ""
  echo "==> smoke autenticado pulado (defina ALLEONE_SMOKE_EMAIL e ALLEONE_SMOKE_PASSWORD no ambiente)"
fi

echo ""
echo "OK — teste atualizado."
echo "Público: https://alleone-teste.alletecnologia.com"
echo "Se Nginx de teste mudou (sudo em outro usuário):"
echo "  sudo cp $ROOT/deploy/nginx-alleone-teste-https.conf /etc/nginx/sites-available/alleone-teste"
echo "  sudo nginx -t && sudo systemctl reload nginx"
echo "  (headers/CSP: snippets em $ROOT/deploy/nginx-alleone-*.snippet.conf — git pull já atualiza o include)"
