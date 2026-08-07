# Performance — caches do Alle One

## Dashboard (em memória)

| Env | Default | Uso |
|-----|---------|-----|
| `DASHBOARD_COMPLETE_CACHE_MS` | `60000` | TTL do `/dashboard/complete` |
| `DASHBOARD_COMPLETE_CACHE_MAX` | `40` | Máx. entradas (LRU) |
| `DASHBOARD_HOURS_CACHE_MS` | `600000` | TTL do `/dashboard/hours` |
| `DASHBOARD_HOURS_CACHE_MAX` | `60` | Máx. entradas (LRU) |

Implementação: `backend/src/common/cache/ttl-lru-cache.ts` (TTL + evicção LRU).
Refresh forçado do dashboard já invalida memória (e Redis de horas, se ligado).

## Dashboard horas / complete — L2 Redis (opcional)

Para múltiplas instâncias da API (`pm2` cluster / mais de um processo):

```env
REDIS_URL=redis://127.0.0.1:6379
DASHBOARD_HOURS_REDIS_CACHE=true
DASHBOARD_COMPLETE_REDIS_CACHE=true
```

Sem `REDIS_URL` ou com Redis down, o L1 em memória continua funcionando.

`external_api_cache` é limpo em lotes a cada ~25 writes do TiFlux (`cleanupExpiredExternalApiCache`).

## TiFlux / Zabbix — Postgres `external_api_cache`

Já usado por `TifluxService` e `ZabbixService` quando habilitado:

```env
EXTERNAL_API_CACHE_ENABLED=true
EXTERNAL_API_CACHE_TTL_MS=600000
ZABBIX_DASHBOARD_CACHE_ENABLED=true
ZABBIX_DASHBOARD_CACHE_MS=3600000
```

Prefira leituras do mirror `tiflux.*` / `zabbix.*` (`TIFLUX_RUNTIME_API=false`) para evitar custo de API.

## Limpeza

Entradas expiradas do cache em memória saem no `get`.
No Redis, o TTL (`EX`) remove sozinho.
`external_api_cache`: limpeza periódica sugerida:

```sql
DELETE FROM external_api_cache WHERE expires_at < NOW();
```

## Ver também

- [REDIS.md](./REDIS.md) — filas BullMQ
- [CUTOVER_TIFLUX.md](./CUTOVER_TIFLUX.md) — portal canônico reduz pressão na API TiFlux
