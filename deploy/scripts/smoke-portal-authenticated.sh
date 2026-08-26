#!/usr/bin/env bash
# Smoke autenticado — APIs do portal com sessão real (cookie alleone_access).
#
# Complementa smoke-portal-routes.sh (anônimo). Valida que login funciona e que
# as rotas principais de tickets (e módulos relacionados) respondem 200/201.
#
# Uso (teste):
#   export ALLEONE_SMOKE_EMAIL='admin@alletecnologia.com'
#   export ALLEONE_SMOKE_PASSWORD='***'
#   # opcional se 2FA ativo:
#   export ALLEONE_SMOKE_TOTP='123456'
#   bash deploy/scripts/smoke-portal-authenticated.sh
#
# Variáveis:
#   PORTAL_BASE              URL pública (default: https://alleone-teste.alletecnologia.com)
#   API_PREFIX               Prefixo API (default: /api)
#   ALLEONE_SMOKE_EMAIL      E-mail do usuário (obrigatório)
#   ALLEONE_SMOKE_PASSWORD   Senha (obrigatório)
#   ALLEONE_SMOKE_TOTP       Código TOTP atual (válido ~30s; só na 1ª vez se usar cookie jar)
#   ALLEONE_SMOKE_COOKIE_JAR Caminho persistente p/ cookies (recomendado no servidor).
#                            Após login com TOTP + rememberDevice, próximas execuções pulam 2FA.
#   SMOKE_TICKET_NUMBER      Força um ticket para detalhe (senão usa o 1º da lista)
#   SMOKE_TICKETS_WRITE      Se "1", cria ticket de smoke e faz PATCH no título
#   SMOKE_SKIP_MODULES       Lista vírgula para pular: gmud,pretickets,rendimento
#
set -euo pipefail

PORTAL_BASE="${PORTAL_BASE:-https://alleone-teste.alletecnologia.com}"
API_PREFIX="${API_PREFIX:-/api}"
PORTAL_BASE="${PORTAL_BASE%/}"
API_PREFIX="/${API_PREFIX#/}"
API_PREFIX="${API_PREFIX%/}"
API_URL="${PORTAL_BASE}${API_PREFIX}"

EMAIL="${ALLEONE_SMOKE_EMAIL:-}"
PASSWORD="${ALLEONE_SMOKE_PASSWORD:-}"
TOTP="${ALLEONE_SMOKE_TOTP:-}"
SMOKE_COOKIE_JAR="${ALLEONE_SMOKE_COOKIE_JAR:-}"
SMOKE_TICKET_NUMBER="${SMOKE_TICKET_NUMBER:-}"
SMOKE_TICKETS_WRITE="${SMOKE_TICKETS_WRITE:-0}"
SMOKE_SKIP_MODULES="${SMOKE_SKIP_MODULES:-}"

failed=0
warned=0
COOKIE_JAR=""
COOKIE_JAR_PERSISTENT=0
BODY_DIR=""

pass() { echo "OK  $*"; }
fail() { echo "FAIL $*"; failed=1; }
warn() { echo "!!  $*"; warned=1; }

cleanup() {
  if [[ "$COOKIE_JAR_PERSISTENT" -eq 0 && -n "$COOKIE_JAR" && -f "$COOKIE_JAR" ]]; then
    rm -f "$COOKIE_JAR"
  fi
  if [[ -n "$BODY_DIR" && -d "$BODY_DIR" ]]; then
    rm -rf "$BODY_DIR"
  fi
}
trap cleanup EXIT

should_skip_module() {
  local name="$1"
  if [[ -z "$SMOKE_SKIP_MODULES" ]]; then
    return 1
  fi
  echo ",$SMOKE_SKIP_MODULES," | grep -qi ",${name},"
}

json_get() {
  local expr="$1"
  local file="$2"
  if command -v jq >/dev/null 2>&1; then
    jq -r "$expr" "$file" 2>/dev/null || true
    return
  fi
  python3 - "$expr" "$file" <<'PY' 2>/dev/null || true
import json, sys
expr, path = sys.argv[1], sys.argv[2]
try:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
except Exception:
    sys.exit(0)
def pick(obj, parts):
    cur = obj
    for p in parts:
        if p.endswith("]"):
            key, idx = p[:-1].split("[", 1)
            if key:
                cur = cur.get(key) if isinstance(cur, dict) else None
            try:
                cur = cur[int(idx)] if isinstance(cur, list) else None
            except Exception:
                cur = None
        else:
            cur = cur.get(p) if isinstance(cur, dict) else None
        if cur is None:
            return None
    return cur
parts = []
for token in expr.lstrip(".").split("."):
    if not token:
        continue
    if "[" in token:
        base, rest = token.split("[", 1)
        if base:
            parts.append(base)
        parts.append("[" + rest)
    else:
        parts.append(token)
val = pick(data, parts)
if val is None:
    print("")
elif isinstance(val, (dict, list)):
    print(json.dumps(val))
else:
    print(val)
PY
}

api_request() {
  local method="$1"
  local path="$2"
  local expected="${3:-200}"
  local label="$4"
  local extra_args="${5:-}"

  local outfile="${BODY_DIR}/resp.json"
  local code
  # shellcheck disable=SC2086
  code=$(curl -sk -o "$outfile" -w "%{http_code}" -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -X "$method" \
    -H "Accept: application/json" \
    -H "X-Alleone-Api: 1" \
    $extra_args \
    "${API_URL}${path}" || echo "000")

  local body
  body=$(cat "$outfile" 2>/dev/null || true)

  if echo "$body" | grep -qi "server action not found"; then
    fail "$label — caiu no Next.js (Server Action). URL: ${API_URL}${path}"
    return 1
  fi

  if [[ "$code" == "$expected" ]]; then
    pass "$label ($code)"
    return 0
  fi

  local snippet
  snippet=$(echo "$body" | tr '\n' ' ' | head -c 200)
  fail "$label — esperado HTTP $expected, obteve $code — ${snippet}"
  return 1
}

api_request_any() {
  local method="$1"
  local path="$2"
  local label="$3"
  shift 3
  local allowed=("$@")
  local outfile="${BODY_DIR}/resp.json"
  local code
  code=$(curl -sk -o "$outfile" -w "%{http_code}" -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -X "$method" \
    -H "Accept: application/json" \
    -H "X-Alleone-Api: 1" \
    "${API_URL}${path}" || echo "000")
  local body
  body=$(cat "$outfile" 2>/dev/null || true)
  if echo "$body" | grep -qi "server action not found"; then
    fail "$label — Server Action (${API_URL}${path})"
    return 1
  fi
  for a in "${allowed[@]}"; do
    if [[ "$code" == "$a" ]]; then
      pass "$label ($code)"
      return 0
    fi
  done
  fail "$label — HTTP $code (esperado: ${allowed[*]})"
  return 1
}

login() {
  local login_body="${BODY_DIR}/login.json"
  local payload
  if [[ -n "$TOTP" ]]; then
    payload=$(printf '{"email":"%s","password":"%s","totpCode":"%s","rememberDevice":true}' \
      "$EMAIL" "$PASSWORD" "$TOTP")
  else
    payload=$(printf '{"email":"%s","password":"%s"}' "$EMAIL" "$PASSWORD")
  fi

  local code
  code=$(curl -sk -o "$login_body" -w "%{http_code}" -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d "$payload" \
    "${API_URL}/auth/login" || echo "000")

  local body
  body=$(cat "$login_body" 2>/dev/null || true)

  if echo "$body" | grep -qi '"requires2fa":true\|"requires2FA":true\|"message":"2FA_REQUIRED"'; then
    fail "Login exige 2FA — exporte ALLEONE_SMOKE_TOTP com código NOVO do autenticador (válido ~30s)."
    echo "    Dica: export ALLEONE_SMOKE_COOKIE_JAR=\"\$HOME/.alleone-smoke-cookies\" para não repetir 2FA."
    return 1
  fi

  if echo "$body" | grep -qi 'Código 2FA inválido\|2FA inválido'; then
    fail "POST /auth/login — código 2FA inválido ou expirado."
    echo "    Gere um código NOVO no autenticador e rode:"
    echo "      export ALLEONE_SMOKE_TOTP='\$(código atual)'"
    echo "      bash deploy/scripts/smoke-portal-authenticated.sh"
    return 1
  fi

  if [[ "$code" != "200" && "$code" != "201" ]]; then
    local snippet
    snippet=$(echo "$body" | tr '\n' ' ' | head -c 240)
    fail "POST /auth/login — HTTP $code — $snippet"
    return 1
  fi

  if ! grep -q 'alleone_access' "$COOKIE_JAR" 2>/dev/null; then
    fail "Login OK mas cookie alleone_access não foi gravado."
    return 1
  fi

  if [[ -n "$TOTP" ]] && grep -q 'alleone_totp_trust' "$COOKIE_JAR" 2>/dev/null; then
    pass "POST /auth/login — sessão criada ($code); dispositivo confiável salvo no cookie jar"
  else
    pass "POST /auth/login — sessão criada ($code)"
  fi
}

pick_ticket_number() {
  if [[ -n "$SMOKE_TICKET_NUMBER" ]]; then
    echo "$SMOKE_TICKET_NUMBER"
    return
  fi
  local list_file="${BODY_DIR}/tickets-list.json"
  curl -sk -b "$COOKIE_JAR" -o "$list_file" \
    -H "Accept: application/json" \
    "${API_URL}/tickets?limit=20&includeDone=true" || true

  local n
  n=$(json_get '.groups[0].tickets[0].ticketNumber' "$list_file")
  if [[ -z "$n" || "$n" == "null" ]]; then
    n=$(json_get '.groups[0].tickets[0].ticket_number' "$list_file")
  fi
  echo "${n:-}"
}

smoke_tickets_readonly() {
  echo ""
  echo "==> Tickets (leitura)"

  api_request GET "/tickets?limit=50" 200 "GET /tickets (lista)"
  api_request GET "/tickets?mineOnly=false&includeDone=true&limit=10" 200 \
    "GET /tickets (todos + concluídos)"
  api_request GET "/tickets/catalogs/filters" 200 "GET /tickets/catalogs/filters"
  api_request GET "/tickets/list-presets" 200 "GET /tickets/list-presets"
  api_request GET "/tickets/users/search?q=smoke" 200 "GET /tickets/users/search"

  local catalogs_file="${BODY_DIR}/catalogs-create.json"
  curl -sk -b "$COOKIE_JAR" -o "$catalogs_file" \
    -H "Accept: application/json" \
    "${API_URL}/tickets/catalogs/create" || true
  local cat_code
  cat_code=$(curl -sk -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" \
    -H "Accept: application/json" \
    "${API_URL}/tickets/catalogs/create" || echo "000")
  if [[ "$cat_code" == "200" ]]; then
    pass "GET /tickets/catalogs/create ($cat_code)"
    local client_id desk_id
    client_id=$(json_get '.clients[0].id' "$catalogs_file")
    desk_id=$(json_get '.desks[0].id' "$catalogs_file")
    if [[ -n "$client_id" && "$client_id" != "null" && -n "$desk_id" && "$desk_id" != "null" ]]; then
      api_request GET "/tickets/catalogs/create?clientId=${client_id}&deskId=${desk_id}" 200 \
        "GET /tickets/catalogs/create (cliente+mesa)"
    fi
  else
    warn "GET /tickets/catalogs/create — HTTP $cat_code (sem permissão canCreate?)"
  fi

  local ticket_number
  ticket_number=$(pick_ticket_number)
  if [[ -z "$ticket_number" || "$ticket_number" == "null" ]]; then
    warn "Nenhum ticket na lista — pulando detalhe/estágios/histórico"
    return
  fi

  echo "    (ticket de referência: #${ticket_number})"
  api_request GET "/tickets/${ticket_number}" 200 "GET /tickets/:ticketNumber"
  api_request GET "/tickets/${ticket_number}/stages" 200 "GET /tickets/:ticketNumber/stages"
  api_request GET "/tickets/${ticket_number}/history" 200 "GET /tickets/:ticketNumber/history"
  api_request_any GET "/tickets/${ticket_number}/catalogs/appointment" \
    "GET /tickets/:ticketNumber/catalogs/appointment" 200 403
  api_request GET "/tickets/${ticket_number}/warnings/pending" 200 \
    "GET /tickets/:ticketNumber/warnings/pending"
}

smoke_tickets_write_probes() {
  echo ""
  echo "==> Tickets (rotas de escrita — sem efeito colateral)"

  api_request_any POST "/tickets" "POST /tickets sem payload → 400" 400

  local patch_out="${BODY_DIR}/patch-missing.json"
  local code
  code=$(curl -sk -b "$COOKIE_JAR" -o "$patch_out" -w "%{http_code}" \
    -X PATCH \
    -H "Accept: application/json" \
    -F 'payload={"title":"SMOKE noop"}' \
    "${API_URL}/tickets/99999998" || echo "000")
  if [[ "$code" == "404" ]]; then
    pass "PATCH /tickets/:inexistente → 404 ($code)"
  else
    fail "PATCH /tickets/99999998 — esperado 404, obteve $code"
  fi
}

smoke_tickets_write_full() {
  echo ""
  echo "==> Tickets (criação + PATCH — SMOKE_TICKETS_WRITE=1)"

  local catalogs_file="${BODY_DIR}/catalogs-create.json"
  curl -sk -b "$COOKIE_JAR" -o "$catalogs_file" \
    -H "Accept: application/json" \
    "${API_URL}/tickets/catalogs/create" || true

  local client_id desk_id client_name
  client_id=$(json_get '.clients[0].id' "$catalogs_file")
  desk_id=$(json_get '.desks[0].id' "$catalogs_file")
  client_name=$(json_get '.clients[0].name' "$catalogs_file")

  if [[ -z "$client_id" || "$client_id" == "null" || -z "$desk_id" || "$desk_id" == "null" ]]; then
    warn "Sem cliente/mesa nos catálogos — pulando criação de ticket"
    return
  fi

  local stamp
  stamp=$(date -u +"%Y%m%d-%H%M%S" 2>/dev/null || date +"%Y%m%d-%H%M%S")
  local title="${client_name:-CLIENTE} - SMOKE API ${stamp}"
  local payload
  payload=$(cat <<EOF
{"title":"${title}","description":"<p>Ticket criado pelo smoke autenticado (${stamp}). Pode cancelar.</p>","clientId":${client_id},"deskId":${desk_id},"requestorName":"Smoke Bot","requestorEmail":"${EMAIL}"}
EOF
)

  local create_out="${BODY_DIR}/create-ticket.json"
  local code
  code=$(curl -sk -b "$COOKIE_JAR" -o "$create_out" -w "%{http_code}" \
    -X POST \
    -H "Accept: application/json" \
    -F "payload=${payload}" \
    "${API_URL}/tickets" || echo "000")

  if [[ "$code" != "200" && "$code" != "201" ]]; then
    local snippet
    snippet=$(tr '\n' ' ' < "$create_out" | head -c 240)
    fail "POST /tickets (criar smoke) — HTTP $code — $snippet"
    return
  fi

  local new_number
  new_number=$(json_get '.ticketNumber' "$create_out")
  if [[ -z "$new_number" || "$new_number" == "null" ]]; then
    new_number=$(json_get '.ticket.ticketNumber' "$create_out")
  fi
  pass "POST /tickets — criado #${new_number} ($code)"

  if [[ -z "$new_number" || "$new_number" == "null" ]]; then
    warn "Não foi possível ler ticketNumber da resposta — pulando PATCH"
    return
  fi

  local patch_payload
  patch_payload=$(printf '{"title":"%s (patch ok)"}' "$title")
  local patch_out="${BODY_DIR}/patch-ticket.json"
  code=$(curl -sk -b "$COOKIE_JAR" -o "$patch_out" -w "%{http_code}" \
    -X PATCH \
    -H "Accept: application/json" \
    -F "payload=${patch_payload}" \
    "${API_URL}/tickets/${new_number}" || echo "000")

  if [[ "$code" == "200" ]]; then
    pass "PATCH /tickets/${new_number} — título atualizado ($code)"
  else
    local snippet
    snippet=$(tr '\n' ' ' < "$patch_out" | head -c 240)
    fail "PATCH /tickets/${new_number} — HTTP $code — $snippet"
  fi

  echo "    Ticket de smoke: #${new_number} — revise/cancele manualmente se necessário."
}

smoke_other_modules() {
  echo ""
  echo "==> Outros módulos (sanidade)"

  api_request GET "/auth/me" 200 "GET /auth/me"

  if ! should_skip_module "pretickets"; then
    api_request_any GET "/pre-tickets/count" "GET /pre-tickets/count" 200 403
  fi

  if ! should_skip_module "gmud"; then
    api_request_any GET "/gmuds/companies" "GET /gmuds/companies" 200 403
    api_request_any GET "/gmuds" "GET /gmuds" 200 403
  fi

  if ! should_skip_module "rendimento"; then
    api_request_any GET "/rendimento/summary" "GET /rendimento/summary" 200 403 404
  fi

  api_request_any GET "/companies/session/accessible" \
    "GET /companies/session/accessible" 200 403
  api_request_any GET "/companies/session/mine" \
    "GET /companies/session/mine" 200 403 404
}

main() {
  if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
    echo "Defina ALLEONE_SMOKE_EMAIL e ALLEONE_SMOKE_PASSWORD."
    echo "Ex.: export ALLEONE_SMOKE_EMAIL='voce@alletecnologia.com'"
    exit 2
  fi

  COOKIE_JAR_PERSISTENT=0
  if [[ -n "$SMOKE_COOKIE_JAR" ]]; then
    COOKIE_JAR="$SMOKE_COOKIE_JAR"
    COOKIE_JAR_PERSISTENT=1
    mkdir -p "$(dirname "$COOKIE_JAR")" 2>/dev/null || true
    touch "$COOKIE_JAR"
    chmod 600 "$COOKIE_JAR" 2>/dev/null || true
  else
    COOKIE_JAR=$(mktemp)
  fi
  BODY_DIR=$(mktemp -d)

  echo "==> Smoke autenticado: $PORTAL_BASE (API_PREFIX=$API_PREFIX)"
  echo "    usuário: $EMAIL"
  if [[ "$COOKIE_JAR_PERSISTENT" -eq 1 ]]; then
    echo "    cookie jar: $COOKIE_JAR (persistente)"
  fi
  echo ""

  api_request GET "/health" 200 "GET /health"
  login || exit 1

  smoke_other_modules
  smoke_tickets_readonly
  smoke_tickets_write_probes

  if [[ "$SMOKE_TICKETS_WRITE" == "1" || "$SMOKE_TICKETS_WRITE" == "true" ]]; then
    smoke_tickets_write_full
  else
    echo ""
    echo "    (criação real de ticket pulada — use SMOKE_TICKETS_WRITE=1 para testar POST/PATCH completo)"
  fi

  echo ""
  if [[ "$failed" -ne 0 ]]; then
    echo "Smoke autenticado FALHOU."
    exit 1
  fi
  if [[ "$warned" -ne 0 ]]; then
    echo "Smoke autenticado OK com avisos."
    exit 0
  fi
  echo "Smoke autenticado OK."
}

main "$@"
