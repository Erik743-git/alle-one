# Migração Nginx — whitelist → prefixo `/api`

Objetivo: eliminar atualizações manuais da whitelist a cada nova rota da API.

Configs atuais no repo já usam `/api`:
- `deploy/nginx-alleone-https.conf`
- `deploy/nginx-alleone-teste-https.conf`
- `deploy/nginx-alleone.conf`

Rollback whitelist: `deploy/nginx-alleone-https.whitelist-legacy.conf`.

## Pré-requisitos

1. Janela de manutenção curta (~5 min)
2. Backup do Nginx atual: `sudo cp /etc/nginx/sites-available/alleone /etc/nginx/sites-available/alleone.bak`
3. Atualizar redirect URI OAuth (Google/Microsoft) para `https://dominio/api/auth/.../callback` se ainda apontar sem `/api`

## Passo 1 — Backend

Em `backend/.env`:

```env
API_GLOBAL_PREFIX=api
```

Reinicie a API. Rotas passam a ser `/api/auth/login`, `/api/health`, etc.

## Passo 2 — Frontend

Em `frontend/.env` / `.env.production`:

```env
NEXT_PUBLIC_API_URL=https://alleone.alletecnologia.com/api
```

Rebuild do Next (`npm run build`) e restart `alleone-web`.

## Passo 3 — Nginx

```bash
sudo cp deploy/nginx-alleone-https.conf /etc/nginx/sites-available/alleone
sudo nginx -t && sudo systemctl reload nginx
```

## Passo 4 — Smoke test

```bash
curl -s https://alleone.alletecnologia.com/api/health
# com token interno:
curl -s -H "X-Internal-Health-Token: $HEALTH_INTEGRATIONS_TOKEN" \
  https://alleone.alletecnologia.com/api/health/integrations
curl -sI https://alleone.alletecnologia.com/login
```

Login no navegador + uma página autenticada (dashboard) + Tickets.

## Rollback

1. Remover `API_GLOBAL_PREFIX` do backend
2. Restaurar `NEXT_PUBLIC_API_URL` sem `/api`
3. `sudo cp deploy/nginx-alleone-https.whitelist-legacy.conf /etc/nginx/sites-available/alleone`
   (ou o `.bak` feito no pré-requisito)
4. Rebuild + `pm2 restart alleone-api alleone-web`
5. Restaurar redirect URIs OAuth sem `/api` se necessário

## Compatibilidade dev local

Dev local **não** usa prefixo `/api` por padrão. O rewrite do Next (`/auth` → API) continua funcionando sem `API_GLOBAL_PREFIX`.
