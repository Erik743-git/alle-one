#!/usr/bin/env bash
# Alle One — REINÍCIO TESTE (suporte)
# Uso (na VM, como alleone ou com sudo -u alleone):
#   bash /home/alleone/teste/deploy/scripts/restart-alleone-teste.sh
#
# Não faz git pull nem build — só sobe/reinicia os processos PM2 de teste.
# Não altera produção (alleone-api / alleone-web).
set -euo pipefail

ROOT="${ALLEONE_ROOT:-/home/alleone/teste}"
API_NAME="${ALLEONE_API_NAME:-alleone-teste-api}"
WEB_NAME="${ALLEONE_WEB_NAME:-alleone-teste-web}"
API_HEALTH_URL="${ALLEONE_API_HEALTH_URL:-http://127.0.0.1:3004/api/health}"
WEB_URL="${ALLEONE_WEB_URL:-http://127.0.0.1:3001/login}"
ECOSYSTEM="$ROOT/deploy/ecosystem.teste.config.cjs"

run_pm2() {
  if [[ "$(whoami)" == "alleone" ]]; then
    pm2 "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -u alleone -H pm2 "$@"
  else
    pm2 "$@"
  fi
}

echo "==> Alle One TESTE — restart"
echo "    root: $ROOT"
echo "    api:  $API_NAME | web: $WEB_NAME"
echo ""

if ! command -v pm2 >/dev/null 2>&1 && ! sudo -u alleone -H command -v pm2 >/dev/null 2>&1; then
  echo "ERRO: pm2 não encontrado. Instale ou rode como usuário alleone."
  exit 1
fi

ensure_app() {
  local name="$1"
  if run_pm2 describe "$name" >/dev/null 2>&1; then
    echo "==> pm2 restart $name"
    run_pm2 restart "$name" --update-env
  else
    echo "==> $name não existe no PM2 — tentando start via ecosystem"
    if [[ -f "$ECOSYSTEM" ]]; then
      run_pm2 start "$ECOSYSTEM" --only "$name"
    else
      echo "ERRO: $ECOSYSTEM não encontrado. Suba o processo manualmente."
      exit 1
    fi
  fi
}

ensure_app "$API_NAME"
ensure_app "$WEB_NAME"

echo "==> pm2 save"
run_pm2 save >/dev/null 2>&1 || true

echo "==> Aguardando API de teste subir..."
sleep 5

echo "==> Health API ($API_HEALTH_URL)"
if ! curl -sf "$API_HEALTH_URL" >/dev/null; then
  echo "FALHA: API de teste não respondeu 200 em $API_HEALTH_URL"
  echo "--- últimos logs ($API_NAME) ---"
  run_pm2 logs "$API_NAME" --lines 40 --nostream || true
  exit 1
fi
echo "API OK"

echo "==> Health Web ($WEB_URL)"
WEB_CODE="$(curl -sf -o /dev/null -w "%{http_code}" "$WEB_URL" || echo "000")"
echo "web HTTP $WEB_CODE"
if [[ "$WEB_CODE" != "200" && "$WEB_CODE" != "307" && "$WEB_CODE" != "302" ]]; then
  echo "AVISO: web de teste não retornou 200/302/307 — verifique logs"
  run_pm2 logs "$WEB_NAME" --lines 20 --nostream || true
fi

echo ""
run_pm2 list
echo ""
echo "OK — teste reiniciado."
echo "Público: https://alleone-teste.alletecnologia.com"
