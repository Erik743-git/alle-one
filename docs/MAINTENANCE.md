# Manutenção e melhorias — Alle One

Guia operacional após a auditoria completa do projeto (jun/2026).

## Status das melhorias

| Área | Status |
|------|--------|
| Permissões alinhadas (menu / página / API) | ✅ |
| Segurança (deletedAt, MIME, health + DB) | ✅ |
| API_URL centralizado (`@/lib/env`) | ✅ |
| Nginx (inventário attachments, admin outbox) | ✅ |
| Worker outbox TiFlux (`CREATE_APPOINTMENT`) | ✅ |
| Relatórios TiFlux (concorrência, não N+1 serial) | ✅ |
| Dashboard modularizado (types + date utils) | ✅ parcial — próxima fase: hours/zabbix |
| Testes backend (guards, permissions, concurrency) | ✅ |
| Backup Postgres + deploy com health gate | ✅ |
| Error boundary no frontend | ✅ |
| Admin usuários → `usersService` | ✅ |

## Worker TiFlux (portal → API)

Apontamentos criados em **Tickets** gravam fila `portal_tiflux_outbox` com `CREATE_APPOINTMENT` + `PENDING`.

- **Job:** `TicketsOutboxJob` — cron a cada minuto (`tickets-outbox.job.ts`)
- **Processador:** `TicketsOutboxService.processPendingBatch()`
- **Retry admin:** `POST /admin/reprocess-tiflux-outbox` (reenfileira `FAILED` e processa)

Variáveis: integração TiFlux já configurada em `backend/.env` (`TIFLUX_*`).

## Estrutura do dashboard (refatoração)

| Arquivo | Responsabilidade |
|---------|------------------|
| `dashboard.service.ts` | Orquestração (API pública inalterada) |
| `dashboard.types.ts` | Tipos de resposta e filtros |
| `dashboard-date.utils.ts` | Datas, semanas, meses, ranges |

Próxima fase (sem urgência): extrair blocos Zabbix, horas TiFlux e fonte TiFlux para serviços dedicados.

## Convenções

### URL da API (frontend)

```ts
import { API_URL } from "@/lib/env";
```

Porta dev da API: **3002** (3000 = Next).

### Permissões

- Menu: `frontend/lib/access-control.ts`
- Página: `<PermissionGate module="…">`
- Admin: `PORTAL_PERMISSION_MODULES`

### Nginx (produção)

Arquivo canônico: `deploy/nginx-alleone-https.conf`

```bash
sudo cp /home/alleone/producao/deploy/nginx-alleone-https.conf /etc/nginx/sites-available/alleone
sudo nginx -t && sudo systemctl reload nginx
```

### Backup Postgres

```bash
bash deploy/scripts/backup-postgres.sh
```

Cron sugerido (usuário `alleone`, 3h):

```cron
0 3 * * * ALLEONE_ROOT=/home/alleone/producao bash /home/alleone/producao/deploy/scripts/backup-postgres.sh >> /home/alleone/logs/backup.log 2>&1
```

## Checklist de deploy

1. `bash deploy/scripts/pos-deploy-alleone.sh`
2. Reload nginx se `deploy/nginx*.conf` mudou
3. `curl -s https://alleone.alletecnologia.com/health` → `"database":"up"`
4. Testar: login, permissões, anexo inventário, apontamento ticket → status sync TiFlux

## Documentação relacionada

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [SECURITY.md](./SECURITY.md)
- [V2-TICKETS.md](./V2-TICKETS.md)
- [V2-APONTAMENTOS.md](./V2-APONTAMENTOS.md)
- [../deploy/POS_DEPLOY_OPERACIONAL.md](../deploy/POS_DEPLOY_OPERACIONAL.md)
