# Deploy Alle One — VM Linux (PM2 + Nginx)

Guia para publicar em **Ubuntu** com Node **20** (nvm), PostgreSQL local e acesso público em  
`http://alleone.alletecnologia.com:8000/`.

> **Segurança:** não commite `.env` no Git. Troque senhas que foram compartilhadas em chat.  
> A senha do banco tem `@` e `#` — na `DATABASE_URL` use **URL encode** (veja abaixo).

---

## 1. Pré-requisitos na VM

```bash
# Node (você já tem via nvm)
node -v   # v20.19.x
npm -v

# PM2 global
npm install -g pm2

# Git
apt update && apt install -y git nginx

# PostgreSQL (se ainda não tiver o banco "portal")
# apt install -y postgresql postgresql-contrib
```

Teste o banco:

```bash
psql "postgresql://uportal@127.0.0.1:5432/portal" -c "SELECT 1;"
```

---

## 2. Clonar o projeto

```bash
sudo mkdir -p /home/alleone/producao
sudo chown -R $USER:$USER /home/alleone/producao
cd /home/alleone/producao

# Substitua pela URL real do GitHub (SSH ou HTTPS)
git clone https://github.com/SUA-ORG/alle-one.git .
# ou: git clone git@github.com:SUA-ORG/alle-one.git .
```

Pare o teste antigo se ainda estiver na porta 3000:

```bash
pm2 delete site-node 2>/dev/null || true
pm2 delete alleone-web alleone-api 2>/dev/null || true
```

---

## 3. Senha do banco na DATABASE_URL (importante)

Senha exemplo: `All3@2026!@#`  
Caracteres especiais na URL:

| Caractere | Encode |
|-----------|--------|
| `@`       | `%40`  |
| `!`       | `%21`  |
| `#`       | `%23`  |

Exemplo:

```env
DATABASE_URL="postgresql://uportal:All3%402026%21%40%23@127.0.0.1:5432/portal?schema=public"
```

---

## 4. Backend — `.env`

```bash
nano /home/alleone/producao/backend/.env
```

Conteúdo mínimo com **HTTPS na 443** (Nginx → front `3000`, API `3002`). Modelo completo: `backend/.env.production.vm.example`.

```env
NODE_ENV=production
PORT=3002
TRUST_PROXY=1
SWAGGER_ENABLED=false

DATABASE_URL="postgresql://uportal:SENHA_URL_ENCODED@127.0.0.1:5432/portal?schema=public"

JWT_SECRET="gere_um_segredo_longo_aleatorio_32_chars_minimo"
JWT_EXPIRES_IN=1d

# Domínio público (sem porta — o certificado SSL está na 443)
CORS_ORIGINS="https://alleone.alletecnologia.com"
FRONTEND_URL=https://alleone.alletecnologia.com

# Em HTTPS: NÃO use AUTH_COOKIE_SECURE=false

# TiFlux / SMTP / Zabbix — copie do .env de desenvolvimento se usar
TIFLUX_API_URL=https://api.tiflux.com/api/v2
TIFLUX_TOKEN=
TIFLUX_RUNTIME_API=false
TIFLUX_UNSAFE_ENDPOINTS=false
# Sync schema tiflux.*: projeto alleone-tiflux-sync (não use TIFLUX_SYNC_* no portal)
```

Build e migrations:

```bash
cd /home/alleone/producao/backend
npm ci
npx prisma generate
npm run build
npx prisma migrate deploy
```

Teste rápido:

```bash
node dist/src/main.js
# Deve subir na 3002; Ctrl+C e siga para PM2
```

---

## 5. Frontend — build com URL da API

O Next **grava** `NEXT_PUBLIC_API_URL` no build. Como só a porta **8000** está exposta, use **mesmo host** e deixe o Nginx repassar as rotas da API (seção 7).

```bash
cd /home/alleone/producao/frontend
```

Crie `.env.production` (ou exporte antes do build):

```bash
cat > .env.production << 'EOF'
NEXT_PUBLIC_API_URL=https://alleone.alletecnologia.com/api
EOF
```

Modelo: `frontend/.env.production.example`.

```bash
npm ci
npm run build
```

---

## 6. Subir com PM2

Na raiz do repositório:

```bash
cd /home/alleone/producao
pm2 start deploy/ecosystem.config.cjs
pm2 status
pm2 logs alleone-api --lines 50
pm2 logs alleone-web --lines 50
pm2 startup
pm2 save
```

Testes internos na VM:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3002/
```

---

## 7. Nginx — portas 80 / 443 (recomendado) ou 8000

O Nginx na VM encaminha:

- **páginas** → frontend `3000`
- **rotas da API** → backend `3002`

Arquivo versionado: `deploy/nginx-alleone.conf` (escuta **80**; **8000** só redireciona para 80).

```bash
# Desative site antigo na 80 se existir (ex.: node3000)
sudo rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/node3000 2>/dev/null || true

sudo cp /home/alleone/producao/deploy/nginx-alleone.conf /etc/nginx/sites-available/alleone
sudo ln -sf /etc/nginx/sites-available/alleone /etc/nginx/sites-enabled/alleone
sudo nginx -t
sudo systemctl reload nginx
```

Acesso: **http://alleone.alletecnologia.com/** (sem porta).

### URLs e `.env` (obrigatório ao mudar de :8000)

**Backend** `backend/.env`:

```env
CORS_ORIGINS="http://alleone.alletecnologia.com"
FRONTEND_URL=http://alleone.alletecnologia.com
AUTH_COOKIE_SECURE=false
```

**Frontend** `frontend/.env.production`:

```env
NEXT_PUBLIC_API_URL=http://alleone.alletecnologia.com/api
```

```bash
sudo -u alleone bash -lc 'cd /home/alleone/producao/backend && npm run build'
sudo -u alleone bash -lc 'cd /home/alleone/producao/frontend && npm run build'
sudo -u alleone pm2 restart alleone-api alleone-web
```

### HTTPS na 443 (certificado já disponível)

1. Descubra os arquivos do certificado na VM:

```bash
sudo ls -la /etc/letsencrypt/live/alleone.alletecnologia.com/ 2>/dev/null
# ou pergunte à TI: caminho do .crt/.pem e da chave privada
```

2. Edite `deploy/nginx-alleone-https.conf` (linhas `ssl_certificate` / `ssl_certificate_key`), copie para o Nginx:

```bash
sudo cp /home/alleone/producao/deploy/nginx-alleone-https.conf /etc/nginx/sites-available/alleone
sudo ln -sf /etc/nginx/sites-available/alleone /etc/nginx/sites-enabled/alleone
sudo nginx -t && sudo systemctl reload nginx
```

3. URLs e cookies (HTTPS):

```env
# backend/.env
CORS_ORIGINS="https://alleone.alletecnologia.com"
FRONTEND_URL=https://alleone.alletecnologia.com
TRUST_PROXY=1
# Remova AUTH_COOKIE_SECURE=false (em HTTPS o cookie Secure é o padrão)

# frontend/.env.production
NEXT_PUBLIC_API_URL=https://alleone.alletecnologia.com/api
```

```bash
sudo -u alleone bash -lc 'cd /home/alleone/producao/backend && npm run build'
sudo -u alleone bash -lc 'cd /home/alleone/producao/frontend && npm run build'
sudo -u alleone pm2 restart alleone-api alleone-web
```

Acesso: **https://alleone.alletecnologia.com/** — HTTP `:80` e legado `:8000` redirecionam para HTTPS.

**Let's Encrypt** (se ainda não instalou): `sudo certbot --nginx -d alleone.alletecnologia.com`

---

## 8.1 Pós-deploy operacional (Nginx + migrate + .env)

Checklist detalhado: **`deploy/POS_DEPLOY_OPERACIONAL.md`**

```bash
# alleone — migrate + API
bash /home/alleone/producao/deploy/scripts/pos-deploy-alleone.sh

# ubuntu — Nginx
sudo cp /home/alleone/producao/deploy/nginx-alleone-https.conf /etc/nginx/sites-available/alleone
sudo nginx -t && sudo systemctl reload nginx
```

---

## 8. Atualizar versão (deploy novo)

```bash
cd /home/alleone/producao
git pull

cd backend
npm ci
npx prisma generate
npm run build
npx prisma migrate deploy

cd ../frontend
npm ci
npm run build

cd ..
pm2 restart alleone-api alleone-web

# Se alterou deploy/nginx-*.conf na VM:
sudo cp /home/alleone/producao/deploy/nginx-alleone-https.conf /etc/nginx/sites-available/alleone
sudo nginx -t && sudo systemctl reload nginx
```

---

## 9. Problemas comuns

| Sintoma | O que verificar |
|--------|------------------|
| Login: “Erro ao conectar com a API” | `NEXT_PUBLIC_API_URL` no build; Nginx repassa rotas `/auth`; backend `pm2 logs alleone-api` |
| `JWT_SECRET é obrigatório` | `backend/.env` com `JWT_SECRET` |
| Prisma P1001 | Postgres rodando; `DATABASE_URL` com senha encoded |
| Porta 3000 ocupada | `pm2 delete site-node`; só `alleone-web` na 3000 |
| CORS | `CORS_ORIGINS` = URL exata do browser (sem barra no final; ex. `http://alleone.alletecnologia.com`) |
| Login “reinicia” / volta ao login sem erro | HTTP + cookie `Secure` → `AUTH_COOKIE_SECURE=false` e `pm2 restart alleone-api` |
| `Cannot GET /dashboard` (JSON 404) | Nginx antigo mandava `/dashboard` para a API → `sudo cp deploy/nginx-alleone.conf /etc/nginx/sites-available/alleone` e `reload` |
| Login/páginas “off” ou 502 | `pm2 status`; `curl -I http://127.0.0.1:3000/login`; subir `alleone-web` |
| Auditoria API 404 / inventário tipos 404 | Nginx: `^/admin/(overview-stats|audit-logs)` → API 3002; páginas `/admin` → Next 3000 |
| `Cannot GET /admin` (JSON no browser) | Nginx muito amplo em `/admin` — corrigir `deploy/nginx-alleone-https.conf` e `reload` |
| `must be owner of table` após restore | `ALTER TABLE ... OWNER TO uportal` em `public` e `tiflux` |

### Backup e logs (operação)

```bash
# Backup uploads (contratos, GMUD, inventário)
sudo tar -czf /var/backups/alleone-uploads-$(date +%F).tar.gz -C /home/alleone/producao/backend uploads

# Logs PM2 (usuário alleone)
sudo -u alleone pm2 logs alleone-api --lines 100
sudo -u alleone pm2 logs alleone-web --lines 100
sudo -u alleone pm2 flush   # limpar logs antigos (opcional)
```

---

## 10. HTTPS (443)

Ver seção 7 (`certbot` ou `nginx-alleone-ssl.conf.example`).

---

## Checklist rápido

- [ ] Postgres `portal` acessível
- [ ] `backend/.env` com `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`
- [ ] `npm run build` + `prisma migrate deploy` no backend
- [ ] `NEXT_PUBLIC_API_URL` + `npm run build` no frontend
- [ ] `pm2 start deploy/ecosystem.config.cjs`
- [ ] Nginx na **80** (e **443** se HTTPS) apontando 3000 + 3002
- [ ] Teste login no navegador
