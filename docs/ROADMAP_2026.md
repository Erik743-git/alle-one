# Roadmap Alle One — 2026

Versão do produto: **0.6.0** (estabilização + confiabilidade).

## Situação atual (atualizado)

| Dimensão | Nota | Estado |
|----------|------|--------|
| Funcionalidades MVP | Alta | GMUD, tickets, apontamentos, dashboard, OAuth, inventário |
| Documentação / deploy | Alta | Runbooks, migração Nginx, backup, monitoramento |
| Segurança | Alta | Cookie-only JWT, tokenVersion, OAuth JWKS, senha unificada |
| Testes | Média | 68+ specs backend, Vitest frontend, Playwright smoke |
| Operações | Média-alta | health-check.sh (token), `/health/integrations` protegido, CI com migrate |
| Escalabilidade | Média | Storage S3 opcional; worker outbox isolável |
| Observabilidade | Média-alta | Health integrations + alerta sync stale no correio |

**Produção:** `https://alleone.alletecnologia.com`  
**Dependência crítica:** `alleone-tiflux-sync`

---

## Fase 1 — Estabilização ✅ (concluída no código local)

- [x] OAuth produção + validação conta cadastrada
- [x] Dashboard `useAuth` (empresa correta)
- [x] Senha provisória normalizada
- [x] JWT `tokenVersion` + migration `20260821120000`
- [x] Microsoft OAuth JWKS (`jose`) + `email_verified`
- [x] Política de senha unificada (`IsStrongPassword`)
- [x] Exception filter global
- [x] Throttle callbacks OAuth
- [x] CI: lint backend, testes frontend, **Postgres + migrate deploy**
- [x] Scripts `db:migrate`, `db:deploy`, `db:generate`
- [x] Versões 0.5.0 alinhadas
- [x] **Remover Bearer legado** (cookie httpOnly only)
- [x] Testes: `auth`, `permissions`, `users`, `tickets-stage-groups`, `gmud-access`, `app.service`
- [x] **Playwright** smoke (`frontend/e2e/login.spec.ts`)
- [x] **Nginx `/api`** — exemplo + `deploy/MIGRACAO_NGINX_API.md`
- [x] **Monitoramento** — `deploy/MONITORING.md`, `scripts/health-check.sh`
- [x] **Backup restore** — `deploy/BACKUP_RESTORE.md`
- [x] **`GET /health/integrations`** — sync TiFlux + outbox (**protegido**: token interno ou ADMIN)

### Pendente deploy em prod (não é código)

- [ ] `git pull` + build + `prisma migrate deploy` (token_version)
- [ ] Migração Nginx `/api` em **produção** (configs prontas no repo — `deploy/MIGRACAO_NGINX_API.md`)
- [ ] Cron backup + health-check

---

## Fase 2 — Confiabilidade ✅ (concluída no código local)

- [x] Endpoint saúde integrações + doc outbox (`deploy/OUTBOX_WORKER.md`)
- [x] SLA automatizado + alerta se `tifluxSync.status = stale` (job + correio)
- [x] V2 tickets: dual-write TiFlux (S4), reconciliação `POST /tickets/reconcile` (S5)
- [x] Worker outbox PM2 dedicado (`outbox-runner.ts` + `TIFLUX_OUTBOX_DISABLED`)
- [x] Object storage local + S3/MinIO opcional (`FILE_STORAGE_DRIVER`)
- [x] Extrair `dashboard-integrations.service.ts`
- [x] Extrair `dashboard-hours.service.ts`
- [x] Extrair `tickets-catalogs.service.ts` + `tickets-appointments.service.ts`
- [x] Colaborador/PJ apontar ticket com `TICKETS.canCreate`

---

## Fase 3 — Escala (planejada)

- [x] Redis (fila BullMQ e-mail) — opcional; ver [`REDIS.md`](./REDIS.md); cache genérico ainda aberto
- [x] Sentry básico (init API/Next + captureException 5xx) — OpenTelemetry completo ainda aberto
- [ ] Secret manager
- [ ] Coolify/K8s vs VM
- [x] **Projetos V2** — ticket ↔ apontamento ↔ atividade (ver `docs/V2-PROJETOS.md`; gaps: N:N / TiFlux-only)
## Fase Portal canônico (cutover TiFlux) — em andamento

Ver [docs/CUTOVER_TIFLUX.md](./CUTOVER_TIFLUX.md).

- [x] Tabela `portal_tickets` + migration
- [x] Dual-write em `POST /tickets`
- [x] Dual-read via `TICKETS_PORTAL_CANONICAL`
- [x] Script ETL `prisma/scripts/etl-tiflux-tickets-to-portal.ts`
- [x] Flags `TICKETS_PORTAL_CANONICAL` / `TICKETS_TIFLUX_WRITE`
- [ ] Validar dual-read em staging
- [ ] Desligar `TICKETS_TIFLUX_WRITE` e sync externo em prod

---

## Deploy completo (VM)

```bash
cd /home/alleone/producao
git pull origin main

cd backend
npm ci
npm run build
npx prisma migrate deploy   # inclui token_version

cd ../frontend
npm ci
npm run build

pm2 restart alleone-api alleone-web
pm2 save

# Smoke
chmod +x deploy/scripts/health-check.sh
./deploy/scripts/health-check.sh
```

### Variáveis novas (backend `.env`)

```env
# Opcional — após migração Nginx
# API_GLOBAL_PREFIX=api

TIFLUX_SYNC_STALE_HOURS=6
```

### Migrations desta leva

1. `20260821120000_user_session_token_version`
2. `20260822120000_mailbox_tiflux_sync_stale`

---

## Testes locais

```bash
# Backend
cd backend && npm test && npm run lint:ci

# Frontend
cd frontend && npm test && npm run lint

# E2E (API + web rodando)
cd frontend
E2E_WITH_API=1 npm run test:e2e
```

---

## Matriz de riscos

| Risco | Status |
|-------|--------|
| Nginx whitelist | Mitigação pronta (`/api` + guia migração) |
| Poucos testes E2E completos | Smoke CI; expandir com `E2E_WITH_API` |
| Cache em memória | Fase 3 |
| Sync TiFlux parado | `/health/integrations` + MONITORING.md |
| Uploads em disco | Fase 2 object storage |
