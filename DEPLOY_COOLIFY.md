## Deploy seguro (Coolify) — Alle One

### Antes de tudo (obrigatório)
- **Troque imediatamente todas as senhas/tokens** que foram compartilhados em chat/print.
- **Não comite `.env`** (o repositório já ignora). Em produção use **Secrets/Env Vars do Coolify**.

### Arquivos adicionados neste repo (produção)
- `backend/Dockerfile` e `frontend/Dockerfile`
- `docker-compose.prod.yml` (stack completa)
- `backend/.env.example` (sem segredos)
- `.dockerignore` em `backend/` e `frontend/`

### Como subir no Coolify (recomendado)
**Opção A — Docker Compose (mais simples):**
1. No Coolify, crie um **New Resource → Docker Compose** apontando para o repositório.
2. Selecione o arquivo `docker-compose.prod.yml`.
3. Defina as variáveis/segredos abaixo no Coolify (Environment Variables / Secrets).
4. Configure **domínio + HTTPS (Let’s Encrypt)** no serviço **frontend** (porta 3000).
5. No backend, **não publique porta** (deixe só na rede interna do compose).

### Variáveis mínimas (produção)
**Postgres**
- `POSTGRES_DB` (ex.: `alleone`)
- `POSTGRES_USER` (ex.: `alleone`)
- `POSTGRES_PASSWORD` (**forte**)

**Backend**
- `DATABASE_URL` (use host `postgres`, ex.: `postgresql://USER:PASSWORD@postgres:5432/alleone?schema=public`)
- `JWT_SECRET` (**forte**, 32+ chars)
- `CORS_ORIGINS` (ex.: `https://alleone.alletecnologia.com`)
- `TRUST_PROXY=1`
- `SWAGGER_ENABLED=false`
- Integrações (se usar): `SMTP_*`, `ZABBIX_*`, `TIFLUX_*`

**Frontend**
- `NEXT_PUBLIC_API_URL`
  - recomendado: **mesmo domínio** com path, via proxy/rewrite (ex.: `https://alleone.alletecnologia.com/backend`)
  - alternativa: subdomínio (ex.: `https://api.alleone.alletecnologia.com`)

> Nota: no Next, `NEXT_PUBLIC_*` é “injetado” no build. No Coolify, garanta que essa env var esteja disponível no build.

### Prisma migrations (produção)
O container do backend executa `npx prisma migrate deploy` ao iniciar.
- Se ocorrer falha de migration (P3009), resolva com:
  - `npx prisma migrate resolve --rolled-back <NOME_DA_MIGRATION>`
  - depois rode `npx prisma migrate deploy` novamente

### Checklist de segurança (infra)
- **SSH por chave**, desabilitar senha e root-login via SSH
- **Firewall**: expor somente `80/443` (e `22` restrito)
- **Banco não público**: sem `ports:` para Postgres
- **Backups** automáticos do Postgres + teste de restore
- Logs/monitoramento e atualizações do host/Docker

