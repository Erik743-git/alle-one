# Performance — Alle One (produção)

## O que já está no código (deploy)

- **API PM2 cluster**: 2 instâncias (`deploy/ecosystem.config.cjs`)
- **Crons**: só na instância `NODE_APP_INSTANCE=0` (`shouldRunScheduledJobs`)
- **Memória API**: `max_memory_restart: 1500M`
- **Gzip Nginx**: `deploy/nginx-alleone-gzip.snippet.conf`
- **Listagem de projetos**: queries em lote (sem N+1)

## Aplicar na VM (teste primeiro)

### 1. Deploy normal

```bash
bash /home/alleone/teste/deploy/scripts/pos-deploy-alleone-teste.sh
```

### 2. Recriar API em cluster (obrigatório na 1ª vez)

`pm2 restart` **não** troca `fork` → `cluster`. Rode:

```bash
cd /home/alleone/teste
pm2 delete alleone-teste-api 2>/dev/null || true
pm2 start deploy/ecosystem.teste.config.cjs --only alleone-teste-api
pm2 save
pm2 status   # deve mostrar 2 instâncias online para alleone-teste-api
curl -s http://127.0.0.1:3004/api/health
```

Produção (após validar teste):

```bash
cd /home/alleone/producao
pm2 delete alleone-api 2>/dev/null || true
pm2 start deploy/ecosystem.config.cjs --only alleone-api
pm2 save
curl -s http://127.0.0.1:3002/health
```

### 3. Gzip no Nginx

```bash
sudo nginx -t && sudo systemctl reload nginx
```

(Configs em `sites-enabled` já incluem o snippet após `git pull`.)

## Próximo ganho recomendado: Redis + cache do dashboard

No `backend/.env` de produção:

```env
REDIS_URL="redis://127.0.0.1:6379"
DASHBOARD_COMPLETE_REDIS_CACHE=true
DASHBOARD_HOURS_REDIS_CACHE=true
```

Reiniciar API após alterar `.env`.

## Pool Postgres (com 2 instâncias API)

Sugestão no `DATABASE_URL`:

```text
postgresql://...?connection_limit=8&pool_timeout=10
```

Regra: `(instâncias PM2 da API) × connection_limit` deve ficar bem abaixo de `max_connections` do Postgres (deixar folga para syncs e admin).

## Monitorar após mudança

```bash
pm2 monit
pm2 logs alleone-api --lines 50
```

Se RAM da VM apertar, reduza para `instances: 1` temporariamente ou suba a VM.
