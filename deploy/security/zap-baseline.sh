#!/usr/bin/env bash
# OWASP ZAP baseline (passivo) — somente ambiente de teste.
set -euo pipefail

TARGET="${1:-https://alleone-teste.alletecnologia.com}"
TARGET="${TARGET%/}"

if [[ "$TARGET" != *teste* ]]; then
  echo "Recusado: o alvo precisa ser ambiente de teste (URL contendo 'teste'). Alvo: $TARGET" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker nao encontrado." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/deploy/security/out"
mkdir -p "$OUT"

echo "ZAP baseline -> $TARGET"
echo "Relatorio: $OUT/zap-report.html"

docker run --rm \
  -v "$OUT:/zap/wrk/:rw" \
  -t ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t "$TARGET" -r zap-report.html -I

echo "Concluido. Abra deploy/security/out/zap-report.html"
