# Release 0.5.0 — Deploy em produção

Data de referência: **2026-06-02**

## Resumo

Esta release consolida melhorias em **GMUD**, **Tickets**, **Apontamentos** e **Autenticação OAuth**, com novas migrations Prisma.

---

## Novidades

### GMUD
- Filtros da lista corrigidos (empresa, estágios vazios).
- Exportação **PDF** (`GET /gmuds/:id/pdf`) com logos Alle/empresa.
- Botão **Exportar PDF** na página de detalhe.

### Tickets
- **GMUD do cliente**: referência textual livre (`externalGmudRef`) — não vincula à GMUD interna do portal.
- Filtro e coluna na lista; edição no detalhe do ticket.
- **Descrição rica** em apontamentos (texto + prints intercalados).
- Preview de imagens em **base64 no banco** (`preview_data_base64`) + correção do download (`StreamableFile`).
- Miniaturas clicáveis e modal de visualização.

### Apontamentos (admin)
- Hub com 3 cards: colaboradores, **HE pendentes**, **justificativas pendentes** (voluntária vs alerta).
- Página `/apontamentos/aprovar-justificativas` com aprovação em massa.
- Descrição compacta com “Ver mais” em HE e justificativas.

### Auth (opcional)
- Login **Google** e **Microsoft** (variáveis `OAUTH_*` no `.env` — ver `backend/.env.example`).

---

## Migrations (ordem automática via `migrate deploy`)

| Migration | Descrição |
|-----------|-----------|
| `20260817120000_user_microsoft_id` | Campo `microsoft_id` em usuários (OAuth) |
| `20260818120000_portal_ticket_gmud_links` | Tabela vínculo ticket↔GMUD (substituída na seguinte) |
| `20260819120000_ticket_external_gmud_ref` | GMUD externa: `external_gmud_ref` (remove FK interna) |
| `20260820120000_appointment_attachment_preview` | Preview base64 em anexos de apontamento |

> Vínculos antigos `gmud_id` **não são migrados** para texto — revisar manualmente se necessário.

---

## Comandos — VM produção (usuário `alleone`)

```bash
cd /home/alleone/producao
git pull origin main

# Backend
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
pm2 restart alleone-api

# Backfill opcional: gravar preview base64 dos prints já existentes
node scripts/backfill-attachment-previews.mjs

# Health
curl -s http://127.0.0.1:3002/health

# Frontend (rebuild obrigatório — mudou UI e env público)
cd ../frontend
npm ci
npm run build
pm2 restart alleone-web

pm2 list
```

---

## Variáveis de ambiente (revisar após pull)

### Backend (`backend/.env`)

| Variável | Quando |
|----------|--------|
| `OAUTH_GOOGLE_CLIENT_ID` / `SECRET` | Se habilitar login Google |
| `OAUTH_MICROSOFT_CLIENT_ID` / `SECRET` / `TENANT_ID` | Se habilitar login Microsoft |
| `OAUTH_CALLBACK_BASE_URL` | URL pública da API (ex. `https://alleone.alletecnologia.com`) |

Demais variáveis: manter conforme `backend/.env.production.vm.example`.

### Frontend

`NEXT_PUBLIC_API_URL` deve estar em `.env.production` **antes** do `npm run build`.

---

## Nginx (sudo, se necessário)

Se rotas novas retornarem 404 HTML do Next em vez da API:

```bash
sudo cp /home/alleone/producao/deploy/nginx-alleone-https.conf /etc/nginx/sites-available/alleone
sudo nginx -t && sudo systemctl reload nginx
```

---

## Verificação pós-deploy

1. `/gmud` — filtros e export PDF em um registro.
2. `/tickets` — coluna GMUD (texto) e detalhe com referência externa.
3. Ticket com apontamento — miniatura do print visível e modal abre.
4. `/apontamentos` — 3 cards no hub; links para HE e justificativas.
5. `/apontamentos/aprovar-justificativas` — lista carrega sem erro 500.
6. Login OAuth (se configurado).

---

## Rollback

```bash
cd /home/alleone/producao
git log -3 --oneline
git checkout <commit-anterior>
# repetir build backend + frontend e pm2 restart
```

Migrations **não** revertem automaticamente — em rollback de código, colunas novas permanecem no banco (geralmente compatível).
