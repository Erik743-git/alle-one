# Manutenção e melhorias — Alle One

Guia do que foi corrigido, o que ainda depende de evolução futura e como operar o portal com segurança.

## Correções aplicadas (2026-06)

### Segurança e sessão

| Item | O que mudou |
|------|-------------|
| Usuário excluído | `buildRequestUser` rejeita usuários com `deletedAt` — JWT antigo não mantém sessão |
| Uploads | Contratos, logos e anexos de tickets validam tipo MIME (como GMUD/Inventário) |
| Health check | `GET /health` testa conexão com Postgres; deploy falha se API não responder |

### Permissões (menu = página = API)

| Item | O que mudou |
|------|-------------|
| Inventário | Sidebar, `PermissionGate` e API usam a mesma matriz — revogar no admin funciona de verdade |
| Tickets | Módulo **Tickets** aparece na matriz de permissões; acesso controlado por `canView` |
| Mensagem | Sem permissão: texto claro antes do redirect ao dashboard |

### Frontend e rede

| Item | O que mudou |
|------|-------------|
| `API_URL` | Todos os serviços importam `@/lib/env` (porta **3002** em dev) |
| `/auth/me` | Uma chamada por sessão + refresh ao focar a aba (sem triplicar em cada página) |
| Inventário | Card com nome longo truncado corretamente |
| Nginx | Rota `/inventario/attachments/*` vai para a API |

### Operação

| Item | O que mudou |
|------|-------------|
| Backup | Script `deploy/scripts/backup-postgres.sh` |
| Deploy | `pos-deploy-alleone.sh` interrompe se health da API falhar |

## O que **não** foi reescrito (de propósito)

Evitamos refatorações grandes que poderiam quebrar produção:

1. **`dashboard.service.ts` (~3.400 linhas)** — funciona; quebrar em módulos é tarefa futura com testes.
2. **`reports.service.ts` / `rendimento.service.ts`** — mesmo motivo; relatórios TiFlux em loop são lentos mas estáveis.
3. **Worker da outbox TiFlux** — tabela `PortalTifluxOutbox` existe; sync de apontamentos portal→TiFlux depende do projeto `alleone-tiflux-sync` ou cron dedicado (ver [V2-APONTAMENTOS.md](./V2-APONTAMENTOS.md)).
4. **Suite de testes ampla** — apenas helpers críticos já tinham specs; expansão gradual recomendada.

## Convenções do projeto

### URL da API (frontend)

```ts
import { API_URL } from "@/lib/env";
```

Nunca usar `localhost:3000` como fallback da API — 3000 é o Next; a API Nest roda em **3002**.

### Permissões no frontend

- **Menu:** funções `canAccess*` em `frontend/lib/access-control.ts`
- **Página:** `<PermissionGate module="…">`
- **Admin:** rótulos em `PORTAL_PERMISSION_MODULES` (`permission-modules.ts`)

As três camadas devem usar a mesma regra (`hasPermission` / matriz do backend).

### Nginx em produção

Arquivo canônico: `deploy/nginx-alleone-https.conf`. Após alteração:

```bash
sudo cp /home/alleone/producao/deploy/nginx-alleone-https.conf /etc/nginx/sites-available/alleone
sudo nginx -t && sudo systemctl reload nginx
```

### Backup Postgres (cron sugerido)

```bash
# Diário às 3h — usuário alleone
0 3 * * * ALLEONE_ROOT=/home/alleone/producao bash /home/alleone/producao/deploy/scripts/backup-postgres.sh >> /home/alleone/logs/backup.log 2>&1
```

## Checklist pós-deploy

1. `bash deploy/scripts/pos-deploy-alleone.sh` (usuário `alleone`)
2. Reload nginx se `deploy/nginx*.conf` mudou
3. Conferir `https://alleone.alletecnologia.com` — login, menu conforme perfil, anexos inventário
4. `curl -s https://alleone.alletecnologia.com/health` → `database: "up"`

## Índice da documentação

| Documento | Conteúdo |
|-----------|----------|
| [README.md](./README.md) | Índice geral |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Arquitetura e módulos |
| [SECURITY.md](./SECURITY.md) | Auth, cookies, uploads |
| [MAINTENANCE.md](./MAINTENANCE.md) | Este arquivo |
| [../deploy/POS_DEPLOY_OPERACIONAL.md](../deploy/POS_DEPLOY_OPERACIONAL.md) | Deploy na VM |
