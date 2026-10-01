#!/usr/bin/env bash
# IP real do visitante atrás do Cloudflare (nginx real_ip).
#
# Sem isto o nginx (e a API) enxergam o IP do Cloudflare: o limite de
# tentativas de login trata todo mundo como o mesmo visitante e a auditoria
# grava o IP errado. Com isto, $remote_addr vira o IP real — mas só quando a
# conexão vem de um IP do Cloudflare (quem chamar a VM direto não consegue
# falsificar o cabeçalho).
#
# Vale para produção e teste (arquivo global em /etc/nginx/conf.d).
#
# Uso (como ubuntu, na VM):
#   bash deploy/scripts/cloudflare-realip.sh            # só mostra o que faria
#   sudo bash deploy/scripts/cloudflare-realip.sh --aplicar
#
# Rodar de novo uma vez por mês (a lista do Cloudflare muda de vez em quando).
set -euo pipefail

DESTINO=/etc/nginx/conf.d/cloudflare-realip.conf
APLICAR=0
[[ "${1:-}" == "--aplicar" ]] && APLICAR=1

if ! nginx -V 2>&1 | grep -q -- '--with-http_realip_module'; then
  echo "ERRO: este nginx não tem o módulo realip." >&2
  exit 1
fi

if ! grep -Rqs 'include /etc/nginx/conf.d/\*.conf' /etc/nginx/nginx.conf; then
  echo "ERRO: /etc/nginx/nginx.conf não inclui conf.d/*.conf; ajuste antes." >&2
  exit 1
fi

TMP=$(mktemp)
trap 'rm -f "$TMP" "$TMP.v4" "$TMP.v6"' EXIT

curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4 -o "$TMP.v4"
curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6 -o "$TMP.v6"

# Só aceita linhas que parecem CIDR; lista curta demais = algo errado.
V4=$(grep -E '^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$' "$TMP.v4" || true)
V6=$(grep -E '^[0-9a-fA-F:]+/[0-9]{1,3}$' "$TMP.v6" || true)
if [[ $(echo "$V4" | grep -c .) -lt 10 || $(echo "$V6" | grep -c .) -lt 5 ]]; then
  echo "ERRO: lista do Cloudflare veio vazia ou estranha; nada foi alterado." >&2
  exit 1
fi

{
  echo "# Gerado por deploy/scripts/cloudflare-realip.sh em $(date -u +%Y-%m-%dT%H:%MZ)."
  echo "# IP real do visitante: só confia no cabeçalho vindo de IP do Cloudflare."
  for c in $V4 $V6; do echo "set_real_ip_from $c;"; done
  echo "real_ip_header CF-Connecting-IP;"
} > "$TMP"

if [[ $APLICAR -eq 0 ]]; then
  echo "== Prévia de $DESTINO (nada alterado; use --aplicar) =="
  cat "$TMP"
  exit 0
fi

[[ $EUID -eq 0 ]] || { echo "Use sudo para --aplicar." >&2; exit 1; }

BACKUP=""
if [[ -f "$DESTINO" ]]; then
  BACKUP="$DESTINO.bak.$(date +%Y%m%d%H%M%S)"
  cp "$DESTINO" "$BACKUP"
fi
install -m 0644 "$TMP" "$DESTINO"

if nginx -t; then
  systemctl reload nginx || nginx -s reload
  echo "OK: $DESTINO aplicado e nginx recarregado (sem derrubar conexões)."
else
  echo "ERRO no nginx -t: voltando ao anterior." >&2
  if [[ -n "$BACKUP" ]]; then mv "$BACKUP" "$DESTINO"; else rm -f "$DESTINO"; fi
  nginx -t && echo "Configuração anterior restaurada." >&2
  exit 1
fi
