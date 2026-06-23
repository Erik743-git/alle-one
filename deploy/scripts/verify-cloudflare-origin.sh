#!/usr/bin/env bash
# Verifica se a VM está pronta para Cloudflare proxy (nuvem laranja).
# Rode na VM: bash /home/alleone/producao/deploy/scripts/verify-cloudflare-origin.sh

set -euo pipefail

HOST="${ALLEONE_HOST:-alleone.alletecnologia.com}"
ORIGIN_IP="${ALLEONE_ORIGIN_IP:-}"

echo "==> Nginx ativo?"
systemctl is-active nginx >/dev/null || { echo "ERRO: nginx parado — sudo systemctl start nginx"; exit 1; }

echo "==> Escutando em 0.0.0.0:80 e :443?"
ss -tln | grep -E ':80 |:443 ' || { echo "ERRO: portas 80/443 nao abertas"; exit 1; }

echo "==> Porta 80 responde sem redirect 301?"
STATUS=$(curl -sI "http://127.0.0.1/health" -H "Host: ${HOST}" | head -1)
echo "    $STATUS"
echo "$STATUS" | grep -q "200" || {
  echo "ERRO: porta 80 deve retornar 200 (config Cloudflare: deploy/nginx-alleone-cloudflare.conf)"
  exit 1
}

echo "==> API Nest (3002)?"
curl -sf "http://127.0.0.1:3002/health" >/dev/null || echo "AVISO: API nao responde em 3002"

echo "==> PM2"
if command -v pm2 >/dev/null; then
  pm2 list 2>/dev/null | grep -E 'alleone-api|alleone-web' || echo "AVISO: pm2 sem alleone-api/web"
fi

if [[ -n "$ORIGIN_IP" ]]; then
  echo "==> Teste via IP publico (na propria VM)?"
  EXT=$(curl -sI --max-time 5 "http://${ORIGIN_IP}/health" -H "Host: ${HOST}" | head -1 || true)
  echo "    $EXT"
fi

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  echo "==> UFW ativo — confira se 80/443 estao ALLOW:"
  ufw status | grep -E '80|443' || echo "AVISO: libere: sudo ufw allow 80/tcp && sudo ufw allow 443/tcp"
fi

echo ""
echo "OK origem local. Se Cloudflare der 522:"
echo "  1) Firewall IBM/security group: liberar entrada TCP 80 e 443 (0.0.0.0/0)"
echo "  2) Cloudflare DNS: nuvem laranja no A ${HOST}"
echo "  3) SSL/TLS: Automático/Flexível (origem HTTP:80) OU Completo (origem HTTPS:443)"
