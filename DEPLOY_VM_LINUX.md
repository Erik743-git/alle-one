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

Conteúdo mínimo (ajuste segredos e integrações):

```env
NODE_ENV=production
PORT=3002
TRUST_PROXY=1
SWAGGER_ENABLED=false

DATABASE_URL="postgresql://uportal:SENHA_URL_ENCODED@127.0.0.1:5432/portal?schema=public"

JWT_SECRET="gere_um_segredo_longo_aleatorio_32_chars_minimo"
JWT_EXPIRES_IN=1d

# Mesma origem pública do navegador (porta 8000)
CORS_ORIGINS="http://alleone.alletecnologia.com:8000"

FRONTEND_URL=http://alleone.alletecnologia.com:8000

# HTTP sem HTTPS na porta 8000: cookie não pode ser Secure (senão login “reinicia” a página)
AUTH_COOKIE_SECURE=false
# Não defina AUTH_COOKIE_DOMAIN enquanto usar host:porta (deixe vazio/comentado)

# TiFlux / SMTP / Zabbix — copie do .env de desenvolvimento se usar
TIFLUX_API_URL=https://api.tiflux.com/api/v2
TIFLUX_TOKEN=
TIFLUX_SYNC_ENABLED=true
TIFLUX_SYNC_STARTUP=true
TIFLUX_RUNTIME_API=false
TIFLUX_UNSAFE_ENDPOINTS=false
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
NEXT_PUBLIC_API_URL=http://alleone.alletecnologia.com:8000
EOF
```

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

## 7. Nginx — porta 8000 (proxy + API no mesmo host)

Como o NAT/proxy público aponta para **8000**, o Nginx escuta 8000 e:

- envia **páginas** → frontend `3000`
- envia **rotas da API** → backend `3002`

```bash
# Copie o arquivo versionado (evita mandar /dashboard para a API → JSON 404)
sudo cp /home/alleone/producao/deploy/nginx-alleone.conf /etc/nginx/sites-available/alleone
sudo ln -sf /etc/nginx/sites-available/alleone /etc/nginx/sites-enabled/alleone
sudo nginx -t
sudo systemctl reload nginx
```

O arquivo `deploy/nginx-alleone.conf` separa **páginas** (`/login`, `/dashboard`, `/admin`, `/rendimento`) → Next **3000** e **endpoints** da API (`/dashboard/complete`, `/admin/overview-stats`, etc.) → Nest **3002**.

Acesso: **http://alleone.alletecnologia.com:8000/**

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
```

---

## 9. Problemas comuns

| Sintoma | O que verificar |
|--------|------------------|
| Login: “Erro ao conectar com a API” | `NEXT_PUBLIC_API_URL` no build; Nginx repassa rotas `/auth`; backend `pm2 logs alleone-api` |
| `JWT_SECRET é obrigatório` | `backend/.env` com `JWT_SECRET` |
| Prisma P1001 | Postgres rodando; `DATABASE_URL` com senha encoded |
| Porta 3000 ocupada | `pm2 delete site-node`; só `alleone-web` na 3000 |
| CORS | `CORS_ORIGINS` = URL exata do browser (`http://alleone...:8000`) |
| Login “reinicia” / volta ao login sem erro | HTTP + cookie `Secure` → `AUTH_COOKIE_SECURE=false` e `pm2 restart alleone-api` |
| `Cannot GET /dashboard` (JSON 404) | Nginx antigo mandava `/dashboard` para a API → `sudo cp deploy/nginx-alleone.conf /etc/nginx/sites-available/alleone` e `reload` |
| Login/páginas “off” ou 502 | `pm2 status`; `curl -I http://127.0.0.1:3000/login`; subir `alleone-web` |
| `must be owner of table` após restore | `ALTER TABLE ... OWNER TO uportal` em `public` e `tiflux` |

---

## 10. HTTPS (depois)

Quando tiver certificado ou proxy TLS na frente, atualize:

- `CORS_ORIGINS` → `https://alleone.alletecnologia.com`
- `NEXT_PUBLIC_API_URL` → `https://alleone.alletecnologia.com`  
  (rebuild do frontend obrigatório)
- `AUTH_COOKIE_SECURE=true` (ou remova a linha; padrão em HTTPS)

---

## Checklist rápido

- [ ] Postgres `portal` acessível
- [ ] `backend/.env` com `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`
- [ ] `npm run build` + `prisma migrate deploy` no backend
- [ ] `NEXT_PUBLIC_API_URL` + `npm run build` no frontend
- [ ] `pm2 start deploy/ecosystem.config.cjs`
- [ ] Nginx na 8000 apontando 3000 + 3002
- [ ] Teste login no navegador
