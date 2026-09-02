#!/usr/bin/env bash
# Alle One — atualiza TESTE após ETL em produção (deploy teste + clone portal prod → teste)
#
# Pré-requisito: rodar deploy-ticket-content-prod.sh em prod (ou ETL manual no banco portal).
#
# Uso:
#   bash /home/alleone/teste/deploy/scripts/deploy-ticket-content-teste.sh
set -euo pipefail

TESTE_ROOT="${ALLEONE_ROOT:-/home/alleone/teste}"
PROD_ROOT="${PROD_ROOT:-/home/alleone/producao}"

echo "========== 1/2 Deploy portal teste =========="
bash "$TESTE_ROOT/deploy/scripts/pos-deploy-alleone-teste.sh"

echo ""
echo "========== 2/2 Clone dados portal prod → teste =========="
cd "$TESTE_ROOT"
bash deploy/scripts/clone-portal-data-to-teste.sh

echo ""
echo "Concluído. Valide em https://alleone-teste.alletecnologia.com/tickets/"
