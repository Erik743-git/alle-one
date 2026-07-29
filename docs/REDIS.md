# Redis — filas (BullMQ)

Redis é **opcional**. Sem `REDIS_URL`, o poller de e-mail roda **in-process** (cron 1 min).

## O que usa Redis hoje

| Peça | Detalhe |
|------|---------|
| `RedisService` | ioredis; ping no `GET /health` → `redis: up\|down\|disabled` |
| `QueueService` | fila BullMQ `email-inbound` |
| `EmailInboundWorkerService` | consome a fila quando Redis está up |

Não há cache genérico de aplicação nesta versão.

## Subir local

```bash
cd backend
docker compose up -d redis
```

No `backend/.env`:

```env
REDIS_URL=redis://127.0.0.1:6379
```

Reinicie a API. No log:

- Com Redis: worker BullMQ ativo
- Sem Redis: `REDIS_URL não definido — filas usam fallback in-process/cron`

## Produção / teste na VM

1. Redis acessível (container ou serviço).
2. `REDIS_URL` no `.env` da API.
3. `pm2 restart alleone-api` (ou `alleone-teste-api`).
4. Conferir: `curl -sS https://SEU-DOMINIO/api/health` → `"redis":"up"`.

## Desligar

Remova ou comente `REDIS_URL` e reinicie — o sistema continua com poll in-process.
