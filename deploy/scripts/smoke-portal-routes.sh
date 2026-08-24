#!/usr/bin/env bash
# Smoke — rotas críticas do portal (pós-deploy).
# Garante que chamadas de API não caem no Next.js ("Server action not found").
#
# Uso:
#   bash deploy/scripts/smoke-portal-routes.sh
#   PORTAL_BASE=https://alleone-teste.alletecnologia.com bash deploy/scripts/smoke-portal-routes.sh
#   PORTAL_BASE=https://alleone.alletecnologia.com API_PREFIX=/api bash deploy/scripts/smoke-portal-routes.sh
#
# Variáveis:
#   PORTAL_BASE   — URL pública (default: https://alleone-teste.alletecnologia.com)
#   API_PREFIX    — prefixo da API no Nginx (default: /api)
set -euo pipefail

PORTAL_BASE="${PORTAL_BASE:-https://alleone-teste.alletecnologia.com}"
API_PREFIX="${API_PREFIX:-/api}"
PORTAL_BASE="${PORTAL_BASE%/}"
API_PREFIX="/${API_PREFIX#/}"
API_PREFIX="${API_PREFIX%/}"

failed=0

pass() { echo "OK  $*"; }
fail() { echo "FAIL $*"; failed=1; }
warn() { echo "!!  $*"; }

check_status() {
  local label="$1"
  local url="$2"
  local expected="$3"
  local extra_header="${4:-}"

  local code
  if [[ -n "$extra_header" ]]; then
    code=$(curl -sk -o /dev/null -w "%{http_code}" -H "$extra_header" "$url" || echo "000")
  else
    code=$(curl -sk -o /dev/null -w "%{http_code}" "$url" || echo "000")
  fi

  if [[ "$code" == "$expected" ]]; then
    pass "$label ($code)"
  else
    fail "$label — esperado HTTP $expected, obteve $code ($url)"
  fi
}

check_not_next_action_error() {
  local label="$1"
  local url="$2"
  local method="${3:-POST}"
  local extra_header="${4:-}"

  local body_file
  body_file=$(mktemp)
  local code
  if [[ -n "$extra_header" ]]; then
    code=$(curl -sk -o "$body_file" -w "%{http_code}" -X "$method" -H "$extra_header" "$url" || echo "000")
  else
    code=$(curl -sk -o "$body_file" -w "%{http_code}" -X "$method" "$url" || echo "000")
  fi

  local body
  body=$(cat "$body_file")
  rm -f "$body_file"

  if echo "$body" | grep -qi "server action not found"; then
    fail "$label — resposta do Next.js (Server action not found). Rota API incorreta: $url"
    return
  fi

  # 401/403/400/422 = bateu na API Nest (sem cookie) — OK para smoke anônimo
  case "$code" in
    401|403|400|422|201|200)
      pass "$label — API respondeu ($code), sem erro de Server Action"
      ;;
    404)
      fail "$label — HTTP 404 ($url). Verifique API_PREFIX=$API_PREFIX e Nginx."
      ;;
    405)
      warn "$label — HTTP 405 ($url) — método pode não ser permitido, mas não é Server Action"
      ;;
    *)
      if [[ "$code" =~ ^[45] ]]; then
        pass "$label — HTTP $code (API/Nginx, não Server Action)"
      else
        warn "$label — HTTP $code inesperado ($url)"
      fi
      ;;
  esac
}

echo "==> Smoke portal: $PORTAL_BASE (API_PREFIX=$API_PREFIX)"
echo ""

check_status "GET ${API_PREFIX}/health" "${PORTAL_BASE}${API_PREFIX}/health" "200"

check_not_next_action_error \
  "POST ${API_PREFIX}/tickets (autenticado via header)" \
  "${PORTAL_BASE}${API_PREFIX}/tickets" \
  POST \
  "X-Alleone-Api: 1"

check_not_next_action_error \
  "GET ${API_PREFIX}/tickets/catalogs/create" \
  "${PORTAL_BASE}${API_PREFIX}/tickets/catalogs/create?deskId=1&clientId=1" \
  GET \
  "X-Alleone-Api: 1"

# Rota legada sem prefixo — não deve ser usada pelo frontend em deploy /api
body_file=$(mktemp)
legacy_code=$(curl -sk -o "$body_file" -w "%{http_code}" -X POST -H "X-Alleone-Api: 1" "${PORTAL_BASE}/tickets" || echo "000")
legacy_body=$(cat "$body_file")
rm -f "$body_file"
if echo "$legacy_body" | grep -qi "server action not found"; then
  warn "POST /tickets (sem ${API_PREFIX}) ainda cai no Next — frontend deve usar ${API_PREFIX}/tickets"
else
  pass "POST /tickets legado não retorna Server Action ($legacy_code)"
fi

check_status "GET /login (Next)" "${PORTAL_BASE}/login" "200"

echo ""
if [[ "$failed" -ne 0 ]]; then
  echo "Smoke FALHOU — corrija antes de liberar usuários."
  exit 1
fi

echo "Smoke OK — rotas críticas respondendo."
