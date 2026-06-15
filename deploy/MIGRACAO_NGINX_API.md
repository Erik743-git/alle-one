# Migração Nginx — whitelist → prefixo `/api`

Objetivo: eliminar atualizações manuais da whitelist a cada nova rota da API.

## Pré-requisitos

1. Janela de manutenção curta (~5 min)
2. Backup do Nginx atual: `sudo cp /etc/nginx/sites-available/alleone /etc/nginx/sites-available/alleone.bak`

## Passo 1 — Backend

Em `backend/.env`:

```env
API_GLOBAL_PREFIX=api
```

Reinicie a API. Rotas passam a ser `/api/auth/login`, `/api/health`, etc.

## Passo 2 — Frontend

Em `frontend/.env`:

```env
NEXT_PUBLIC_API_URL=https://alleone.alletecnologia.com/api
```

Rebuild do Next (`npm run build`) e restart `alleone-web`.

## Passo 3 — Nginx

Use o exemplo `deploy/nginx-alleone-https-unified-api.conf.example`:

```bash
sudo cp deploy/nginx-alleone-https-unified-api.conf.example /etc/nginx/sites-available/alleone
sudo nginx -t && sudo systemctl reload nginx
```

## Passo 4 — Smoke test

```bash
curl -s https://alleone.alletecnologia.com/api/health
curl -sI https://alleone.alletecnologia.com/login
```

Login no navegador + uma página autenticada (dashboard).

## Rollback

1. Remover `API_GLOBAL_PREFIX` do backend
2. Restaurar `NEXT_PUBLIC_API_URL` sem `/api`
3. `sudo cp /etc/nginx/sites-available/alleone.bak /etc/nginx/sites-available/alleone`
4. Rebuild + `pm2 restart alleone-api alleone-web`

## Compatibilidade dev local

Dev local **não** usa prefixo `/api` por padrão. O rewrite do Next (`/auth` → API) continua funcionando sem `API_GLOBAL_PREFIX`.
