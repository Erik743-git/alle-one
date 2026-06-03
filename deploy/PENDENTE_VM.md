# Pendências na VM (operacional)

Itens para rodar juntos na próxima sessão de manutenção.

## 1. `git pull` + API (auditoria)

Correção do erro `offset`/`limit` na tela **Admin → Auditoria**:

```bash
cd /home/alleone/producao
git pull
cd backend
npm run build
pm2 restart alleone-api
```

Commit de referência: `e60336e` — `fix(admin): converter offset e limit da auditoria em numero na query`

## 2. Nginx (se ainda não aplicou)

```bash
sudo cp /home/alleone/producao/deploy/nginx-alleone-https.conf /etc/nginx/sites-available/alleone
sudo nginx -t && sudo systemctl reload nginx
```

Importante: `/admin` (página) vai para o Next; só `/admin/overview-stats` e `/admin/audit-logs` vão para a API.

## 3. Migrations

```bash
cd /home/alleone/producao/backend
./node_modules/.bin/prisma migrate deploy
```

## 4. Estatística Geral em CSV (após pull com export CSV)

No gerador de relatórios, tipo **Estatística Geral** → formato **CSV**.

Deploy: `git pull` → `backend` build → `pm2 restart alleone-api` (frontend só se alterou textos do gerador).

## 5. Revisão `.env`

Ver `deploy/POS_DEPLOY_OPERACIONAL.md` (Parte C) — feito manualmente pelo responsável.
