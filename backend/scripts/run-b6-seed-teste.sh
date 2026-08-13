#!/usr/bin/env bash
# Deploy teste + seed B6 (contrato 10h / 12h apontadas → a cobrar R$1300)
# Uso (usuário alleone na VM):
#   bash /home/alleone/teste/backend/scripts/run-b6-seed-teste.sh
set -euo pipefail

ROOT="${ALLEONE_ROOT:-/home/alleone/teste}"
BACKEND="$ROOT/backend"
SCRIPT="$BACKEND/scripts/seed-b6-fechamento-teste.sql"

if [[ "$(whoami)" != "alleone" ]]; then
  echo "AVISO: preferível rodar como alleone (atual: $(whoami))"
fi

echo "==> 1) Atualizar teste (pull + build + restart)"
if [[ -x /home/alleone/scripts/atualizar-teste.sh ]]; then
  bash /home/alleone/scripts/atualizar-teste.sh || {
    echo "AVISO: atualizar-teste terminou com erro (health?). Seguindo com seed se o código veio."
  }
else
  bash "$ROOT/deploy/scripts/pos-deploy-alleone-teste.sh" || true
fi

if [[ ! -f "$SCRIPT" ]]; then
  echo "ERRO: script não encontrado: $SCRIPT"
  echo "Confira se o git pull trouxe c55043b+ (seed B6)."
  exit 1
fi

echo "==> 2) Seed B6 no Postgres"
set -a
# shellcheck disable=SC1091
source <(grep -E '^(DATABASE_URL)=' "$BACKEND/.env" | sed 's/\r$//')
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERRO: DATABASE_URL ausente em $BACKEND/.env"
  exit 1
fi

# psql não gosta de ?schema=public
DBURL="${DATABASE_URL%%\?*}"

psql "$DBURL" -v ON_ERROR_STOP=1 -f "$SCRIPT"

echo ""
echo "OK — seed aplicado."
echo "Agora no portal de teste:"
echo "  Relatórios → Fechamento / cobrança"
echo "  Empresa: a do NOTICE (ex. Alle Cliente)"
echo "  Período: últimos 7 dias (cobrindo os 2 dias de apontamento)"
echo "  Esperado: B=10, C=12, D=-2, E=-300, a cobrar = R\$ 1.300"
echo "Público: https://alleone-teste.alletecnologia.com/gerador-relatorios"
