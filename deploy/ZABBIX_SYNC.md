# Deploy — alleone-zabbix-sync (VM Linux)

Worker separado (como `alleone-tiflux-sync`), pasta **fora** de `producao/`:

```text
/home/alleone/
├── producao/              # portal alle-one (git)
├── alleone-tiflux-sync/   # sync TiFlux
└── alleone-zabbix-sync/   # sync Zabbix  ← este guia
```

---

## 1. Copiar o projeto para a VM

O repositório fica em `C:\SyncTiflux\alleone-zabbix-sync` (dev). Na VM:

```bash
mkdir -p /home/alleone/alleone-zabbix-sync
```

Do seu PC (PowerShell), envie os arquivos (sem `node_modules`):

```powershell
scp -r C:\SyncTiflux\alleone-zabbix-sync\src C:\SyncTiflux\alleone-zabbix-sync\prisma C:\SyncTiflux\alleone-zabbix-sync\package.json C:\SyncTiflux\alleone-zabbix-sync\package-lock.json C:\SyncTiflux\alleone-zabbix-sync\tsconfig.json C:\SyncTiflux\alleone-zabbix-sync\tsconfig.build.json C:\SyncTiflux\alleone-zabbix-sync\nest-cli.json C:\SyncTiflux\alleone-zabbix-sync\.env.example alleone@SEU_SERVIDOR:/home/alleone/alleone-zabbix-sync/
```

---

## 2. `.env` do worker

```bash
cd /home/alleone/alleone-zabbix-sync
cp .env.example .env
nano .env
```

**Use o mesmo Postgres do portal**, com host **`127.0.0.1`** (não `postgres` — isso é só dentro do Docker):

```env
DATABASE_URL="postgresql://uportal:SENHA_URL_ENCODED@127.0.0.1:5432/portal"
ZABBIX_URL="https://seu-zabbix/api_jsonrpc.php"
ZABBIX_TOKEN="..."
SYNC_API_KEY="gere_uma_chave_longa"
PORT=3031
ZABBIX_SYNC_AUTOSTART=true
ZABBIX_SYNC_CRON_ENABLED=true
```

---

## 3. Schema `zabbix.*` no banco

**Opção A** — após `git pull` do portal com a migration `20260616180000_zabbix_sync_schema`:

```bash
cd /home/alleone/producao/backend
npx prisma migrate deploy
```

**Opção B** — se a migration ainda não estiver no Git:

```bash
cd /home/alleone/alleone-zabbix-sync
npm install
npx prisma db push
```

(`db push` só funciona com `DATABASE_URL` apontando para `127.0.0.1`.)

---

## 4. Build e PM2

```bash
cd /home/alleone/alleone-zabbix-sync
npm install
npm run build

# Primeira vez:
pm2 start dist/main.js --name alleone-zabbix-sync

# Ou recarregar ecosystem completo do portal:
# cd /home/alleone/producao && pm2 start deploy/ecosystem.config.cjs
pm2 save
```

Script correto do worker: **`dist/main.js`** (não confundir com a API do portal: `producao/backend/dist/src/main.js`).

---

## 5. Portal — habilitar leitura do banco

Em `/home/alleone/producao/backend/.env`:

```env
ZABBIX_USE_DB_CACHE=true
ZABBIX_DB_STALE_HOURS=2
```

```bash
cd /home/alleone/producao/backend
npm run build
pm2 restart alleone-api
```

---

## 6. Verificar

```bash
pm2 status
curl -s -H "X-Sync-Api-Key: SUA_CHAVE" http://127.0.0.1:3031/sync/status | head
```

Forçar sync CREDISIS:

```bash
curl -X POST -H "X-Sync-Api-Key: SUA_CHAVE" \
  "http://127.0.0.1:3031/sync/run?group=GRP_CREDISIS"
```

---

## Erros comuns

| Erro | Causa | Solução |
|------|--------|---------|
| `No such file ... alleone-zabbix-sync` | Pasta não criada na VM | Seção 1 |
| `Can't reach database server at postgres:5432` | `DATABASE_URL` de Docker no host | Use `127.0.0.1` |
| `Script not found: .../backend/dist/main.js` | PM2 na pasta errada | API = `backend/dist/src/main.js` |
| `No pending migrations` | Código novo não no Git | `git pull` no PC + push, ou `prisma db push` no worker |
