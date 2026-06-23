#!/usr/bin/env bash
# Prova objetiva: por que proxy Cloudflare (laranja) falha ou funciona.
# Rode NA VM de PRODUCAO (IP 169.55.234.232):
#   bash deploy/scripts/prove-cloudflare-proxy.sh
#
# Depois ligue nuvem LARANJA na Cloudflare e rode de novo o passo 4 no PC.

set -u

HOST="${ALLEONE_HOST:-alleone.alletecnologia.com}"
PUBLIC=$(curl -4 -s --max-time 8 ifconfig.me 2>/dev/null || echo "?")

echo "=============================================="
echo " PROVA PROXY CLOUDFLARE"
echo " Host: $HOST"
echo " IP publico desta VM: $PUBLIC"
echo "=============================================="
echo ""

pass=0
fail=0

check() {
  local name="$1"
  local ok="$2"
  if [[ "$ok" == "1" ]]; then
    echo "[PASS] $name"
    pass=$((pass + 1))
  else
    echo "[FAIL] $name"
    fail=$((fail + 1))
  fi
}

echo "=== A) Esta e a VM do DNS? ==="
echo "Cloudflare (nuvem cinza) deve apontar A para: $PUBLIC"
echo ""

echo "=== B) Nginx porta 80 (Cloudflare Flexivel/Automatico usa HTTP:80) ==="
H80=$(curl -sI --max-time 5 "http://127.0.0.1/health" -H "Host: ${HOST}" | head -1)
echo "  Local :80 -> $H80"
if echo "$H80" | grep -q "200"; then
  check "Nginx responde 200 em :80 (sem redirect)" 1
elif echo "$H80" | grep -q "301\|302"; then
  check "Nginx responde 200 em :80 (sem redirect)" 0
  echo "       CAUSA 522 provavel: redirect 80->443. Use deploy/nginx-alleone-cloudflare.conf"
else
  check "Nginx responde 200 em :80 (sem redirect)" 0
fi
echo ""

echo "=== C) Nginx porta 443 (Cloudflare Completo/Completo estrito usa HTTPS:443) ==="
H443=$(curl -skI --max-time 5 "https://127.0.0.1/health" -H "Host: ${HOST}" | head -1)
echo "  Local :443 -> $H443"
if echo "$H443" | grep -q "200"; then
  check "Nginx responde 200 em :443" 1
else
  check "Nginx responde 200 em :443" 0
fi
echo ""

echo "=== D) Certificado TLS na origem ==="
CERT="/etc/letsencrypt/live/${HOST}/fullchain.pem"
if [[ -f "$CERT" ]]; then
  check "Certificado Let's Encrypt existe" 1
  openssl x509 -in "$CERT" -noout -enddate 2>/dev/null | sed 's/^/  /'
else
  check "Certificado Let's Encrypt existe" 0
  echo "  Sem cert em $CERT — modo Completo (estrito) na CF nao funciona"
fi
echo ""

echo "=== E) API ==="
API=$(curl -sf --max-time 5 "http://127.0.0.1:3002/health" 2>/dev/null || true)
if [[ -n "$API" ]]; then
  check "API Nest :3002" 1
else
  check "API Nest :3002" 0
fi
echo ""

echo "=============================================="
echo " CONCLUSAO (origem)"
echo "=============================================="
cat <<EOF

Modo SSL na Cloudflare          O que a CF exige na ORIGEM
-----------------------------------------------------------------
Flexivel / Automatico (padrao)  TCP 80 aberto + HTTP 200 (sem redirect)
Completo / Completo (estrito)   TCP 443 aberto + certificado valido

Se [FAIL] em B + modo Flexivel  -> 522 (timeout ou loop)
Se [PASS] em C + cert OK        -> tente Completo (estrito) + nuvem laranja

Scripts em deploy/scripts/      NAO sao lixo — fazem parte do repo.
Lixo tipico: arquivos em /tmp, configs nginx duplicadas na VM errada.

EOF

echo "PASS: $pass  FAIL: $fail"
echo ""
echo "Proximo passo no PC (nuvem LARANJA ligada):"
echo "  .\deploy\scripts\diagnose-522.ps1 -OriginIp $PUBLIC"
echo "=============================================="
