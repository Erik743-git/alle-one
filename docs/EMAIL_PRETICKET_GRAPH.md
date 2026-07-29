# E-mail → pré-ticket (Microsoft Graph) + Redis + Sentry + 2FA

## Visão geral

E-mails na **caixa compartilhada** M365 viram **pré-tickets** no portal. Operadores triam e clicam **Abrir ticket** → `portal_tickets` (canal `E-mail`, sem responsável até edição).

```mermaid
flowchart LR
  mb[Shared mailbox M365]
  graph[Microsoft Graph]
  poll[Cron poll 1min]
  redis[BullMQ Redis]
  pre[pre_tickets]
  ticket[portal_tickets]
  mb --> graph --> poll
  poll --> redis --> pre
  poll --> pre
  pre -->|Abrir ticket| ticket
```

## Passo a passo — configurar do zero

Objetivo: e-mails enviados **para** `alleone.teste@alletecnologia.com` (ou outra caixa) virarem **pré-tickets**.

### Parte A — Azure (uma vez, conta admin do tenant)

1. Abra [portal.azure.com](https://portal.azure.com).
2. Busque **Microsoft Entra ID**.
3. Menu **App registrations** → **New registration**.
4. Preencha:
   - **Name:** `Alle One Email Inbound`
   - **Supported account types:** *Accounts in this organizational directory only*
   - **Redirect URI:** vazio
5. **Register**.
6. Em **Overview**, copie:
   - **Application (client) ID** → `GRAPH_CLIENT_ID`
   - **Directory (tenant) ID** → `GRAPH_TENANT_ID`
7. **Certificates & secrets** → **New client secret**:
   - Description: `alle-one`
   - Expires: 12 ou 24 meses
   - **Add** → copie o **Value** na hora (só aparece uma vez) → `GRAPH_CLIENT_SECRET`
8. **API permissions** → **Add a permission**:
   - **Microsoft Graph**
   - **Application permissions** (não Delegated)
   - Marque **`Mail.Read`**
   - **Add permissions**
9. **Grant admin consent for …** → **Yes**.
   - Status de `Mail.Read` deve ficar **Granted**.
10. Confirme no M365 que a caixa existe: `alleone.teste@alletecnologia.com` (shared mailbox ou usuário). Em muitos tenants o consent já basta; se o poll der 403/404, o admin Exchange precisa liberar acesso do app à caixa.

### Parte B — `backend/.env`

```env
GRAPH_TENANT_ID=cole-o-directory-tenant-id
GRAPH_CLIENT_ID=cole-o-application-client-id
GRAPH_CLIENT_SECRET=cole-o-value-do-secret
```

Reinicie a API (`npm run start:dev` no `backend`).

Redis é opcional (sem Redis o poll roda in-process):

```env
REDIS_URL=redis://127.0.0.1:6379
```

```bash
cd backend
docker compose up -d redis
npx prisma migrate deploy
```

### Parte C — Portal (Admin)

1. Login como **ADMIN**.
2. **Admin → E-mail** (`/admin/email`) → aba **Recebimento**.
3. Preencha:
   - **Caixa compartilhada:** `alleone.teste@alletecnologia.com`
   - **Graph Tenant ID** / **Graph Client ID** (iguais ao `.env`)
4. Marque **Recebimento ativo** → **Salvar**.
5. Status deve mostrar **Graph: configurado** (secret vem só do `.env`).
6. (Opcional) Direcionamentos: match no **remetente** → prioridade/mesa/empresa. Não é obrigatório para criar o pré-ticket.
7. (Opcional) **Remetentes bloqueados**: e-mails desses endereços entram como `IGNORED` e não aparecem na caixa de pré-tickets.

### Parte D — Testar

1. Envie um e-mail **para** `alleone.teste@alletecnologia.com`.
2. Em Recebimento, clique **Buscar** (ou espere o poll automático ~1 min).
3. Abra **Tickets → Pré-tickets** (clique na **linha** ou no título).
4. Se aparecer, use **Abrir ticket** (✓) para gerar o ticket no portal.

### Se não aparecer

| Sintoma | Checar |
|---------|--------|
| Graph: incompleto (env) | `GRAPH_CLIENT_SECRET` no `.env` + restart da API |
| Poll: lidos 0 | Ativo? Caixa certa? E-mail na Inbox? |
| 401/403 no log | Consent? Secret? Tenant certo? |
| 404 mailbox | Endereço errado ou app sem acesso à caixa |
| Poll ok sem pré-ticket | Message-ID já processado — envie e-mail **novo** |

## Redis

```env
REDIS_URL=redis://127.0.0.1:6379
```

Sem Redis: o poller cron cria pré-tickets **in-process**.

## Sentry

```env
SENTRY_DSN=https://...
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.05
NEXT_PUBLIC_SENTRY_DSN=https://...
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
```

- API: `initSentry()` + `captureException` em erros 5xx / não tratados (`GlobalExceptionFilter`).
- Next: `sentry.client.config.ts` / `sentry.server.config.ts` + `withSentryConfig` quando há DSN.

## 2FA TOTP

- Modal **Segurança / 2FA** no painel do usuário
- Desativar: senha da conta + código 2FA
- Login: `2FA_REQUIRED` + opcional “não pedir por 14 dias” (`TOTP_TRUST_DAYS`)

```env
TOTP_ENCRYPTION_KEY=...
TOTP_ADMIN_REQUIRED=false
TOTP_ADMIN_GRACE_DAYS=14
```

## Endpoints principais

| Método | Path | Quem |
|--------|------|------|
| GET/PATCH | `/admin/email/settings` | ADMIN |
| CRUD | `/admin/email/routes` | ADMIN |
| POST | `/admin/email/poll` | ADMIN |
| GET | `/pre-tickets` | ADMIN/COLLAB |
| POST | `/pre-tickets/:id/open` | ADMIN/COLLAB |
| POST | `/auth/2fa/setup\|confirm\|disable` | autenticado |

## Migração

```bash
cd backend
npx prisma migrate deploy
```

Migrations: `20260727180000_email_preticket_2fa`, `20260728180000_email_blocked_senders`.

## Limitações MVP

- Sem webhook Graph (só poll 1 min + fila se Redis up)
- Aba Geral (logos/separador) stub
- Envio continua SMTP legado
- Anexos limitados a **20 por mensagem** no ingest Graph; imagens embutidas até **~4 MB** (data-URL/CID)

## Anexos e política Outlook (`.rar`)

### No Alle One (portal)

Uploads HTTP do portal (tickets, apontamentos, etc.) aceitam **RAR, 7z, ZIP**, Office e TXT, com validação MIME/magic-bytes em `backend/src/common/upload.config.ts`.

Limites típicos (env):

| Contexto | Variável / default |
|----------|-------------------|
| Upload geral | `UPLOAD_MAX_BYTES` (~10 MB) |
| Apontamentos | até ~25 MB no multipart |

### No Microsoft 365 / Outlook

O **Outlook / Exchange Online** pode **bloquear `.rar` no e-mail** por política da Microsoft (não é regra do Alle One). Sintomas:

- Remetente envia `.rar` e o anexo **não chega** na caixa compartilhada
- Ou chega como `.txt` / removido pela proteção

**O que fazer no time:**

1. Preferir **ZIP** ou anexar pelo **portal** (upload no ticket/apontamento).
2. Se precisar de RAR no e-mail: pedir ao admin M365 revisar políticas de anexos / Safe Attachments (isso é fora do Alle One).
3. Pré-tickets só enxergam o que o Graph devolve na mensagem — se o Outlook removeu o `.rar`, o poll **não** cria esse anexo.
