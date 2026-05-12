# Alle One — Portal SaaS Corporativo

Portal corporativo (web) + API para gestão de clientes/empresas, acessos e permissões, GMUD, contratos, financeiro e integrações (ex.: Zabbix e TiFlux).

> **Importante (segurança)**: este workspace contém arquivos `.env` locais com segredos/credenciais. **Não compartilhe** esses arquivos e **não suba** para repositórios. Para handover, use `.env.example`/variáveis de ambiente no ambiente de execução.

## Visão geral

O **Alle One** é composto por:

- **Backend** (`/backend`): API em NestJS + Prisma + PostgreSQL, com autenticação JWT, Swagger e jobs agendados.
- **Frontend** (`/frontend`): aplicação web em Next.js (App Router) consumindo a API.

Há um **projeto separado** no seu workspace (`C:\SyncTiflux\alleone-tiflux-sync`) voltado a sincronização com TiFlux. Ele **não é o foco** do produto e **não precisa rodar 24/7**; o foco principal é o **Portal** (`alle-one`).

## Stack

- **Backend**: Node.js + TypeScript, NestJS, Prisma, PostgreSQL
- **Frontend**: Next.js (App Router) + React + TypeScript

## Estrutura do repositório

```text
alle-one/
  backend/   # API (NestJS + Prisma)
  frontend/  # Web (Next.js)
```

## GitHub (primeira publicação)

1. Copie os exemplos de ambiente: `backend/.env.example` → `backend/.env` e `frontend/.env.example` → `frontend/.env.local`, e preencha com segredos reais **apenas no seu disco** (nunca commite `.env` / `.env.local`).
2. Crie um repositório vazio no GitHub (sem README inicial, se quiser evitar merge na primeira subida).
3. Na pasta raiz `alle-one`:

```bash
git init
git add .
git commit -m "chore: initial commit"
git branch -M main
git remote add origin <URL_DO_SEU_REPOSITORIO>
git push -u origin main
```

4. O workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda **build** do backend (com `prisma generate`) e do frontend em push/PR para `main` ou `master`. O lint no CI fica comentado até o projeto passar `npm run lint` localmente nos dois apps.

Se qualquer credencial já tiver circulado fora do seu ambiente controlado, **rote** tokens e segredos antes de considerar o repositório seguro.

## Requisitos

- **Node.js** LTS (recomendado 20+)
- **npm** (ou seu gerenciador preferido)
- **PostgreSQL 15+** (via Docker recomendado)

## Como rodar localmente (setup rápido)

### 1) Banco (PostgreSQL)

O backend traz um `docker-compose.yml` apenas para o Postgres:

```bash
cd backend
docker compose up -d
```

Por padrão ele expõe `5432:5432` e cria o banco `alleone`.

### 2) Backend (API)

```bash
cd backend
npm install
```

Crie um arquivo `.env` (local) com as variáveis necessárias (ver seção **Variáveis de ambiente**).

Em seguida:

```bash
# modo dev (watch)
npm run start:dev
```

- **API**: `http://localhost:3003`
- **Swagger**: `http://localhost:3003/docs`

### 3) Migrações / Prisma

O schema Prisma está em `backend/prisma/schema.prisma` e usa `DATABASE_URL`.

Fluxo típico:

```bash
cd backend
npx prisma generate
npx prisma migrate dev
```

> Observação: caso o projeto esteja usando migração “manual” em algum ambiente, alinhe o fluxo antes de aplicar em produção.

### 4) Seed (usuário/admin inicial)

Existe um seed em `backend/prisma/seed.ts` que cria/atualiza:

- empresa base
- usuário admin base

Em **produção** (`NODE_ENV=production`), defina **`ADMIN_SEED_PASSWORD`** com no mínimo **12 caracteres** antes de rodar o seed. Em desenvolvimento, sem essa variável o seed ainda usa `123456` e emite um aviso no console — prefira definir `ADMIN_SEED_PASSWORD` no `.env` local.

Execute quando fizer sentido no ambiente:

```bash
cd backend
npx prisma db seed
```

> **Produção**: nunca rode o seed contra produção sem política explícita (backup, janela de manutenção e senha forte em `ADMIN_SEED_PASSWORD`).

### 5) Frontend (Web)

```bash
cd frontend
npm install
npm run dev
```

Por padrão:
- **Web**: `http://localhost:3000`
- A rota `/` redireciona para `/login`.

## Variáveis de ambiente

### Backend (`backend/.env`)

As variáveis abaixo são as mais importantes (nomes baseados no código atual):

- **`PORT`**: porta da API (default: `3003`)
- **`DATABASE_URL`**: string de conexão do Postgres (Prisma)
- **`JWT_SECRET`**: segredo do JWT (**obrigatório** — a API não inicia sem ele)
- **`JWT_EXPIRES_IN`**: tempo de expiração do token (ex.: `7d`, `1d`; opcional, padrão `1d`)
- **`FRONTEND_URL`**: base URL do frontend (usado, por exemplo, para link de redefinição de senha)
- **`CORS_ORIGINS`**: lista separada por vírgula de origins permitidas. Em **`NODE_ENV=production`** é **obrigatório** definir `CORS_ORIGINS` ou `FRONTEND_URL` (origem exata do site), senão a API encerra na subida.
- **`SWAGGER_ENABLED`**: em produção, `/docs` só sobe se for `true` (por padrão fica desligado).
- **`TRUST_PROXY`**: defina `1` se a API estiver atrás de reverse proxy (nginx, load balancer) para IP e cookies corretos.

Integrações e e-mail (existem dependências no backend; ajuste conforme seu uso real):

- **SMTP** (via nodemailer): host, porta, usuário, senha, remetente
- **Zabbix/TiFlux**: URLs/tokens/IDs conforme módulos e integrações habilitadas

### Frontend (`frontend/.env.local`)

- **`NEXT_PUBLIC_API_URL`**: base URL da API (ex.: `http://localhost:3003`)

> Boas práticas: mantenha `.env.example` sem segredos e use variáveis reais apenas no ambiente.

## Principais módulos do backend (alto nível)

O `AppModule` importa, entre outros:

- **Auth**: login JWT, “primeiro acesso”, esqueci senha, redefinição de senha
- **Users / Companies**: entidades e relacionamento
- **Permissions**: permissões por módulo
- **Gmud**: fluxo de GMUD (status, aprovadores, executores, atividades, anexos)
- **Contracts / Financial / Reports / Dashboard**
- **Integrações**: Zabbix, TiFlux
- **ScheduleModule**: rotinas agendadas

## Qualidade e scripts

### Backend

```bash
cd backend
npm run lint
npm test
npm run test:e2e
```

### Frontend

```bash
cd frontend
npm run lint
npm run build
```

## Riscos e pontos de atenção (para quem assumir)

- **Segredos em `.env` local**: trate como **comprometidos** se já foram compartilhados. Rotacione tokens/senhas e migre para um fluxo com `.env.example` + secret manager no deploy.
- **Fallback inseguro de JWT**: removido; **`JWT_SECRET` é obrigatório** para subir a API.
- **Seed com senha padrão fraca**: em **produção** o seed exige `ADMIN_SEED_PASSWORD` (mín. 12 caracteres). Em desenvolvimento, sem a variável ainda usa `123456` com aviso no console — prefira definir `ADMIN_SEED_PASSWORD` localmente.
- **CI/CD**: não há pipeline no workspace. Para produção, o mínimo recomendado:
  - lint (sem `--fix`), test, build (backend+frontend), e migrations controladas.

## Previsões futuras (roadmap realista)

Dependendo do objetivo (homologação vs produção), os próximos passos com maior retorno costumam ser:

- **Segurança e operações**
  - remover dependência de segredos locais, padronizar `.env.example`
  - hardening de auth (JWT secret obrigatório, políticas de senha, reset com trilha/auditoria)
  - logs estruturados e rastreabilidade (audit log já existe no schema)
- **Confiabilidade**
  - adicionar testes no frontend (Playwright ou equivalente) e expandir testes no backend por módulo crítico
  - CI/CD com checks automáticos e artefatos versionados
- **Deploy**
  - containerização do backend/frontend (Dockerfile) + compose completo ou deploy em plataforma (K8s/VM)
  - healthchecks, migrações e estratégia de rollback

## Status do projeto (estimativa)

Com base na estrutura e no que já existe no código:

- **MVP funcional em ambiente controlado (dev/homolog)**: alto (há módulos, Prisma e Swagger prontos)
- **Pronto para produção sem riscos**: ainda requer trabalho em **segurança**, **CI/CD** e **testes** (especialmente no frontend)

## Suporte / handover

Para assumir o projeto com segurança, o checklist mínimo é:

- levantar todas as variáveis de ambiente usadas por módulo
- rotacionar segredos que já circularam
- padronizar `.env.example` e documentação de setup
- definir estratégia de deploy (docker/K8s/VM) + pipeline

