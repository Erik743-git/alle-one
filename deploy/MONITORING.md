# Monitoramento básico — Alle One

## Endpoints

| URL | Uso | Auth |
|-----|-----|------|
| `GET /health` | API + Postgres (`database: up`) | Público |
| `GET /health/integrations` | Sync TiFlux (`tiflux.tickets`) + fila outbox | Token interno **ou** ADMIN |

Com prefixo `/api` (futuro): `/api/health`, `/api/health/integrations`.

### Integrações (`/health/integrations`)

Acesso:

1. Header `X-Internal-Health-Token` igual a `HEALTH_INTEGRATIONS_TOKEN` no backend, **ou**
2. Sessão JWT com role `ADMIN` (cookie).

```json
{
  "tifluxSync": {
    "status": "ok | stale | unknown | unavailable",
    "lastTicketUpdate": "2026-06-15T12:00:00.000Z",
    "staleAfterHours": 6
  },
  "outbox": { "pending": 0, "failed": 0 }
}
```

Configure `TIFLUX_SYNC_STALE_HOURS` no backend (padrão 6).

## Script local / cron

```bash
chmod +x deploy/scripts/health-check.sh
export HEALTH_INTEGRATIONS_TOKEN="mesmo-valor-do-backend"
ALLEONE_HEALTH_URL=https://alleone.alletecnologia.com ./deploy/scripts/health-check.sh
```

Com prefixo API:

```bash
ALLEONE_API_PREFIX=/api ./deploy/scripts/health-check.sh
```

## PM2

```bash
pm2 status
pm2 logs alleone-api --lines 50
pm2 monit
```

## Alertas sugeridos (manual ou Uptime Kuma / similar)

- HTTP `/health` ≠ 200 por > 2 min
- `tifluxSync.status` = `stale` por > 1h (probe com token interno)
- `outbox.failed` > 10
- Disco `/` > 85%
- Processo PM2 `alleone-api` ou `alleone-web` stopped

## Logs

- PM2: `~/.pm2/logs/`
- Nginx: `/var/log/nginx/error.log`

## Próximo passo (Fase 3)

- Sentry ou OpenTelemetry para erros 500 e traces de dashboard lento.
