# Restore de backup PostgreSQL — Alle One

## Quando usar

- Corrupção de dados, migration falha, necessidade de voltar a um ponto no tempo.

## Pré-requisitos

- Arquivo `.sql.gz` de `deploy/scripts/backup-postgres.sh`
- Acesso ao Postgres da VM como usuário com permissão de restore
- **Parar a API** antes do restore para evitar escrita concorrente

```bash
sudo -u alleone pm2 stop alleone-api
```

## Restore (mesmo banco)

```bash
BACKUP="/home/alleone/backups/postgres/alleone_YYYYMMDD_HHMMSS.sql.gz"
ENV_FILE="/home/alleone/producao/backend/.env"
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'")"

gunzip -c "$BACKUP" | psql "$DATABASE_URL"
```

Se precisar recriar o banco do zero (destrutivo):

```bash
# Ajuste usuário/banco conforme DATABASE_URL
dropdb -h 127.0.0.1 -U uportal portal
createdb -h 127.0.0.1 -U uportal portal
gunzip -c "$BACKUP" | psql "$DATABASE_URL"
```

## Pós-restore

```bash
cd /home/alleone/producao/backend
npx prisma migrate deploy   # garante schema = migrations do código em uso
sudo -u alleone pm2 start alleone-api
curl -s https://alleone.alletecnologia.com/health
```

## Teste periódico recomendado

1x por trimestre em ambiente de homologação:

1. Restaurar backup mais recente em DB de teste
2. Subir API apontando para DB de teste
3. Smoke: login + listar GMUD

## Rotação de backups

`backup-postgres.sh` mantém `ALLEONE_BACKUP_RETENTION_DAYS` (padrão 14 dias).

Cron sugerido (como `alleone`):

```cron
0 3 * * * /home/alleone/producao/deploy/scripts/backup-postgres.sh >> /home/alleone/logs/backup.log 2>&1
```
