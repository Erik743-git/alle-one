# Pós-deploy operacional — VM Alle One

Roteiro para executar **juntos** na VM após `git pull` com código atualizado:

1. Nginx (`/admin/overview-stats`, `/admin/audit-logs`, `/admin/reprocess-rendimento-alerts`, `inventario/asset-types` — **não** `/admin` inteiro)
2. `prisma migrate deploy` (rendimento + demais migrations pendentes)
3. Revisão de `.env` (backend + frontend)

---

## Parte A — Usuário `alleone` (sem sudo)

```bash
# Já logado como alleone@alleone
cd /home/alleone/producao
git pull

cd backend
npm ci
./node_modules/.bin/prisma generate
./node_modules/.bin/prisma migrate deploy
npm run build
pm2 restart alleone-api
pm2 list
curl -s http://127.0.0.1:3002/health
```

**Saída esperada do migrate:** migrations aplicadas sem erro (inclui `20260703130000_rendimento_gap_and_overtime` se ainda não existia).

**Saída esperada do health:** JSON ou HTTP 200 (não `connection refused`).

---

## Parte B — Usuário com sudo (`ubuntu` ou admin)

O usuário `alleone` **não** consegue `sudo`. Saia do shell alleone (`exit`) ou abra outra sessão SSH como `ubuntu`.

```bash
sudo cp /home/alleone/producao/deploy/nginx-alleone-https.conf /etc/nginx/sites-available/alleone
sudo nginx -t
sudo systemctl reload nginx
```

Se `nginx -t` falhar, **não** dê reload — corrija o arquivo antes.

### Conferir Nginx (ainda como admin ou alleone)

```bash
# API direta (alleone)
curl -s -o /dev/null -w "api-direto:%{http_code}\n" http://127.0.0.1:3002/health

# Rotas que antes davam 404 no Nginx — 401 = chegou na API (sem cookie); 404 HTML = ainda errado
curl -s -o /dev/null -w "admin-api:%{http_code}\n" \
  -H "Host: alleone.alletecnologia.com" \
  http://127.0.0.1/admin/audit-logs

curl -s -o /dev/null -w "admin-pagina:%{http_code}\n" \
  -H "Host: alleone.alletecnologia.com" \
  http://127.0.0.1/admin

curl -s -o /dev/null -w "inventario-tipos:%{http_code}\n" \
  -H "Host: alleone.alletecnologia.com" \
  http://127.0.0.1/inventario/asset-types
```

| Código | Significado |
|--------|-------------|
| `401` ou `403` | OK — Nginx repassou para a API |
| `404` (HTML Next) | Nginx antigo — repetir Parte B |
| `502` | API parada — Parte A |
| `/admin` → JSON `Cannot GET /admin` | Nginx enviou página para API — atualizar config (só `overview-stats` e `audit-logs` na 3002) |
| `/admin` → `200` HTML | OK — Next na 3000 |

---

## Parte C — Revisar `.env` (você edita; não commitar)

### Backend — `/home/alleone/producao/backend/.env`

Compare com `backend/.env.production.vm.example`:

```bash
cd /home/alleone/producao/backend
grep -E '^(NODE_ENV|PORT|TRUST_PROXY|CORS_ORIGINS|FRONTEND_URL|DATABASE_URL|JWT_SECRET|TIFLUX_RUNTIME_API|TIFLUX_UNSAFE|AUTH_COOKIE)' .env | sed 's/=.*/=***oculto***/'
```

| Variável | Produção HTTPS |
|----------|----------------|
| `NODE_ENV` | `production` |
| `PORT` | `3002` |
| `TRUST_PROXY` | `1` |
| `CORS_ORIGINS` | `https://alleone.alletecnologia.com` (sem `/` no final) |
| `FRONTEND_URL` | mesma URL |
| `DATABASE_URL` | Postgres local; senha com `@#` → URL-encode |
| `JWT_SECRET` | 32+ caracteres; **não** vazio |
| `TIFLUX_RUNTIME_API` | `false` |
| `TIFLUX_UNSAFE_ENDPOINTS` | `false` ou omitido |
| `AUTH_COOKIE_SECURE` | **não** usar `false` em HTTPS |
| `SWAGGER_ENABLED` | `false` |

**Opcional (performance dashboard):**

```env
DASHBOARD_COMPLETE_CACHE_MS=180000
TIFLUX_USE_DB_CACHE=true
```

Depois de alterar `.env`:

```bash
pm2 restart alleone-api
```

### Frontend — `/home/alleone/producao/frontend/.env.production`

```bash
cat /home/alleone/producao/frontend/.env.production
```

Deve ter:

```env
NEXT_PUBLIC_API_URL=https://alleone.alletecnologia.com
```

Se mudou a URL, **obrigatório** rebuild:

```bash
cd /home/alleone/producao/frontend
npm run build
pm2 restart alleone-web
```

---

## Release v0.4.0 (V2 Tickets + Apontamentos)

**Obrigatório:** `migrate deploy` (5 migrations novas) + **rebuild do frontend** (novas rotas `/tickets`, `/rendimento/empresa/...`).

Migrations:

- `20260808120000_portal_tiflux_outbox`
- `20260809120000_portal_appointment_attachments`
- `20260810120000_portal_ticket_appointments`
- `20260811120000_rendimento_appointment_questions`
- `20260812120000_rendimento_question_abonado`

No `backend/.env` (se ainda não tiver):

```env
PORTAL_PUBLIC_URL=https://alleone.alletecnologia.com
```

SMTP preenchido para e-mails de questionamento de apontamentos (cliente → gestores).

Deploy rápido (usuário `alleone`):

```bash
bash /home/alleone/producao/deploy/scripts/pos-deploy-alleone.sh
```

---

## Parte D — Teste no navegador (admin)

- [ ] Login em https://alleone.alletecnologia.com
- [ ] **Admin → Auditoria** carrega lista (não 404)
- [ ] **Inventário** — tipos de ativo / cadastro
- [ ] **Apontamentos** — agenda colaborador; admin toggle Empresas
- [ ] **Tickets** — lista e detalhe (admin)
- [ ] Cliente: **Apontamentos** → agenda da própria empresa

---

## Script opcional (só Parte A)

```bash
bash /home/alleone/producao/deploy/scripts/pos-deploy-alleone.sh
```
