# Worker outbox TiFlux (Fase 2)

Por padrão o job `TicketsOutboxJob` roda **no mesmo processo** da API (`alleone-api`).

Para isolar carga de fila em produção:

## Opção A — manter no API (atual)

- Cron a cada 1 min processa até 15 itens
- Retry admin: `POST /admin/reprocess-tiflux-outbox`
- Reconciliação: `POST /tickets/reconcile?retry=true`

## Opção B — processo PM2 dedicado

1. Build: `npm run build` (gera `dist/src/workers/outbox-runner.js`)
2. Adicionar ao PM2 — ver `deploy/ecosystem.config.example.js`
3. Na API: `TIFLUX_OUTBOX_DISABLED=true` (desliga o cron embutido)
4. Worker: `npm run start:outbox` ou PM2 `alleone-outbox`

## Monitoramento

- `GET /health/integrations` → `outbox.pending` / `outbox.failed` + `tifluxSync.status`
- Job horário alerta admins no correio quando `tifluxSync.status = stale`
- Cooldown do alerta: `TIFLUX_SYNC_STALE_ALERT_COOLDOWN_HOURS` (padrão 6h)

## Sync TiFlux

O worker **não** substitui `alleone-tiflux-sync`. Sem sync, leituras de tickets ficam desatualizadas mesmo com outbox saudável.
