#!/usr/bin/env bash
# Diagnóstico Cloudflare 522 — rode NA VM (ubuntu@alleone)
# Uso: bash diagnose-522.sh
#      ALLEONE_HOST=alleone.alletecnologia.com bash diagnose-522.sh

set -u

HOST="${ALLEONE_HOST:-alleone.alletecnologia.com}"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()  { echo -e "${GREEN}[OK]${NC} $*"; }
warn(){ echo -e "${YELLOW}[AVISO]${NC} $*"; }
fail(){ echo -e "${RED}[FALHA]${NC} $*"; }

echo "=============================================="
echo " Diagnóstico 522 — AlleOne (origem / VM)"
echo " Host: ${HOST}"
echo " Data: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "=============================================="
echo ""

echo "=== 1) Identidade da VM ==="
echo "hostname: $(hostname)"
echo "hostname -I: $(hostname -I 2>/dev/null || true)"
echo -n "IP público (ifconfig.me): "
PUBLIC_IP=""
if command -v curl >/dev/null; then
  PUBLIC_IP=$(curl -4 -s --max-time 8 ifconfig.me 2>/dev/null || true)
  echo "${PUBLIC_IP:-timeout/erro}"
else
  echo "curl não instalado"
fi
echo ""
echo "Interfaces IPv4:"
ip -4 addr show 2>/dev/null | grep -E 'inet ' | awk '{print "  " $2 " dev " $NF}' || true
echo ""
echo ">>> Anote o IP público acima. O registro A na Cloudflare (nuvem cinza) DEVE ser esse IP."
echo ""

echo "=== 2) Nginx ==="
if systemctl is-active nginx >/dev/null 2>&1; then
  ok "nginx ativo"
else
  fail "nginx parado — sudo systemctl start nginx"
fi
echo "Portas em escuta:"
ss -tln 2>/dev/null | grep -E ':80 |:443 ' || fail "nada escutando em 80/443"
echo ""
echo "Teste local HTTP :80 /health:"
HTTP_LOCAL=$(curl -sI --max-time 5 "http://127.0.0.1/health" -H "Host: ${HOST}" 2>/dev/null | head -1 || true)
echo "  ${HTTP_LOCAL:-sem resposta}"
if echo "$HTTP_LOCAL" | grep -q "200"; then
  ok "Nginx responde 200 na porta 80 (config Cloudflare OK)"
elif echo "$HTTP_LOCAL" | grep -q "301"; then
  fail "porta 80 redireciona para HTTPS — use deploy/nginx-alleone-cloudflare.conf"
else
  fail "porta 80 não retorna 200"
fi
echo ""

echo "=== 3) Aplicação (PM2 / API) ==="
if command -v pm2 >/dev/null; then
  pm2 list 2>/dev/null | grep -E 'alleone-api|alleone-web|online|stopped' || warn "pm2 sem processos alleone"
else
  warn "pm2 não encontrado no PATH deste usuário"
fi
API_HEALTH=$(curl -sf --max-time 5 "http://127.0.0.1:3002/health" 2>/dev/null || true)
if [[ -n "$API_HEALTH" ]]; then
  ok "API :3002/health → ${API_HEALTH}"
else
  fail "API não responde em 127.0.0.1:3002"
fi
echo ""

echo "=== 4) Firewall local (ufw) ==="
if command -v ufw >/dev/null; then
  ufw status 2>/dev/null | head -5
else
  warn "ufw não instalado"
fi
echo ""

echo "=== 5) DNS público (o que o mundo resolve) ==="
if command -v dig >/dev/null; then
  echo "A record (pode ser IP Cloudflare se proxy laranja):"
  dig +short A "${HOST}" 2>/dev/null | sed 's/^/  /' || true
  echo ""
  echo "Para ver IP de ORIGEM: na Cloudflare, DNS → alleone → coluna Conteúdo,"
  echo "ou desative proxy (nuvem cinza) e rode: dig +short A ${HOST}"
else
  warn "dig não instalado — use nslookup no seu PC"
fi
echo ""

echo "=== 6) Teste pelo IP público (da própria VM) ==="
if [[ -n "$PUBLIC_IP" ]]; then
  echo "curl http://${PUBLIC_IP}/health (Host: ${HOST}):"
  HTTP_PUBLIC=$(curl -sI --max-time 8 "http://${PUBLIC_IP}/health" -H "Host: ${HOST}" 2>/dev/null | head -1 || true)
  if [[ -n "$HTTP_PUBLIC" ]]; then
    echo "  ${HTTP_PUBLIC}"
    ok "IP público respondeu (hairpin OK nesta rede)"
  else
    warn "sem resposta pelo IP público DA PRÓPRIA VM — comum em IBM; teste do seu PC"
    echo "  No Windows: Test-NetConnection -ComputerName ${PUBLIC_IP} -Port 80"
  fi
else
  warn "não foi possível obter IP público"
fi
echo ""

echo "=============================================="
echo " INTERPRETAÇÃO DO ERRO 522"
echo "=============================================="
cat <<'EOF'

522 = Cloudflare não conectou na ORIGEM (timeout).

Checklist (cada um elimina uma causa):

  [A] DNS Cloudflare — registro A "alleone" = IP público desta VM?
      (IBM Console → alle.host01 → Público; deve bater com seção 1)
      IP errado (ex. 169.55.x) → 522 mesmo com VM saudável.

  [B] Porta 80 aberta DE FORA até este IP?
      Nuvem CINZA + Test-NetConnection porta 80 no seu PC.
      False/timeout → firewall IBM (security group), não é bug do portal.

  [C] Nginx local OK? (seção 2 = 200)
      Se 301 na :80 → config nginx Cloudflare não aplicada.

  [D] API OK? (seção 3)
      522 raramente é API; seria 502 depois que CF conecta.

  [E] Proxy laranja + SSL Flexível → Cloudflare usa HTTP:80 na origem.
      Porta 443 na origem não basta se modo for Flexível/Automático.

Ordem recomendada:
  1) Corrigir IP no DNS Cloudflare (nuvem cinza para validar)
  2) Test-NetConnection porta 80 no IP correto
  3) Se 80 fechada → IBM Infraestrutura → firewall / security group
  4) Se 80 aberta e site OK cinza → nuvem laranja de novo

EOF

if [[ -n "$PUBLIC_IP" ]]; then
  echo "IP para colar na Cloudflare (registro A): ${PUBLIC_IP}"
  echo "(confira também IBM Console — use o IP 'Público' do servidor)"
fi
echo "=============================================="
