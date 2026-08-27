#!/usr/bin/env bash
# Valida Prisma Client + build Nest antes de subir PM2.
# Uso: bash deploy/scripts/verify-backend-ready.sh /home/alleone/producao/backend
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/deploy-common.sh
source "$ROOT_DIR/lib/deploy-common.sh"

verify_backend_ready "${1:?informe o diretório backend}"
