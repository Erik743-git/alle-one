# Scripts de suporte — Alle One (VM)

## Pasta estável (recomendado para suporte)

Fica **fora do git** em `/home/alleone/scripts/` — não depende de `git pull`.

```bash
# Site caiu — só reinicia PM2
bash /home/alleone/scripts/reiniciar-prod.sh
bash /home/alleone/scripts/reiniciar-teste.sh

# Código novo — pull + build + restart
bash /home/alleone/scripts/atualizar-prod.sh
bash /home/alleone/scripts/atualizar-teste.sh
```

### Enviar do PC (Windows)

```powershell
.\deploy\scripts\enviar-scripts-suporte.ps1 -RemoteUser ubuntu -RemoteHost SEU_IP_OU_HOST
```

Detalhes: `deploy/scripts/suporte/README.md`

## Caminhos dentro do clone (alternativa)

```bash
bash /home/alleone/producao/deploy/scripts/pos-deploy-alleone.sh
bash /home/alleone/teste/deploy/scripts/pos-deploy-alleone-teste.sh
bash /home/alleone/producao/deploy/scripts/restart-alleone-prod.sh
bash /home/alleone/teste/deploy/scripts/restart-alleone-teste.sh
```

| Ambiente | Pasta app | API PM2 | Web PM2 | Health local |
|----------|-----------|---------|---------|--------------|
| Prod | `/home/alleone/producao` | `alleone-api` | `alleone-web` | `:3002/api/health` |
| Teste | `/home/alleone/teste` | `alleone-teste-api` | `alleone-teste-web` | `:3004/api/health` |

Se o restart falhar: `pm2 logs alleone-api --lines 50` (ou `alleone-teste-api`).
