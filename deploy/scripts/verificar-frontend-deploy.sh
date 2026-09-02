#!/usr/bin/env bash
# Diagnóstico rápido: o frontend no disco tem o commit com as correções da lista de tickets?
#
# Uso:
#   ALLEONE_ROOT=/home/alleone/producao bash deploy/scripts/verificar-frontend-deploy.sh
#   ALLEONE_ROOT=/home/alleone/teste bash deploy/scripts/verificar-frontend-deploy.sh
set -euo pipefail

ROOT="${ALLEONE_ROOT:-/home/alleone/producao}"
PAGE="$ROOT/frontend/app/tickets/page.tsx"
EXPECTED_COMMIT="${ALLEONE_EXPECTED_COMMIT:-924c409}"

echo "==> $ROOT"
cd "$ROOT"
echo "branch: $(git branch --show-current)"
echo "HEAD:   $(git log -1 --oneline)"

if git merge-base --is-ancestor "$EXPECTED_COMMIT" HEAD 2>/dev/null; then
  echo "commit $EXPECTED_COMMIT: PRESENTE no HEAD"
else
  echo "commit $EXPECTED_COMMIT: AUSENTE — rode:"
  echo "  git fetch origin feat/cutover-tiflux-hardening-20260727"
  echo "  git checkout feat/cutover-tiflux-hardening-20260727"
  echo "  git pull origin feat/cutover-tiflux-hardening-20260727"
fi

if grep -q 'alle-alert-banner' "$PAGE" 2>/dev/null; then
  echo "fonte tickets/page.tsx: ANTIGA (ainda tem alle-alert-banner)"
else
  echo "fonte tickets/page.tsx: OK (sem banner)"
fi

if grep -q 'gap-0 overflow-hidden py-0' "$PAGE" 2>/dev/null; then
  echo "fonte tickets/page.tsx: OK (gap da tabela)"
else
  echo "fonte tickets/page.tsx: ANTIGA (sem gap-0 py-0)"
fi

if grep -q 'allowClear' "$PAGE" 2>/dev/null; then
  echo "fonte tickets/page.tsx: OK (allowClear nas datas)"
else
  echo "fonte tickets/page.tsx: ANTIGA (sem allowClear)"
fi

if [[ -f "$ROOT/frontend/.next/BUILD_ID" ]]; then
  echo "build .next/BUILD_ID: $(cat "$ROOT/frontend/.next/BUILD_ID")"
  echo "build mtime: $(stat -c '%y' "$ROOT/frontend/.next/BUILD_ID" 2>/dev/null || stat -f '%Sm' "$ROOT/frontend/.next/BUILD_ID")"
else
  echo "build: .next ausente — rode npm run build no frontend"
fi

WEB_NAME="${ALLEONE_WEB_NAME:-}"
if [[ -z "$WEB_NAME" ]]; then
  if [[ "$ROOT" == *teste* ]]; then
    WEB_NAME="alleone-teste-web"
  else
    WEB_NAME="alleone-web"
  fi
fi

if command -v pm2 >/dev/null 2>&1; then
  echo ""
  pm2 describe "$WEB_NAME" 2>/dev/null | grep -E 'cwd|status|restarts|uptime' || echo "pm2: processo $WEB_NAME não encontrado"
fi
