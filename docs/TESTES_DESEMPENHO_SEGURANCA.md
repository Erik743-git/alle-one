# Testes de desempenho, segurança e UI — ambiente de teste

Use **só** `https://alleone-teste.alletecnologia.com` (API em `/api`). Não rode carga alta nem ZAP full scan em produção.

Ordem sugerida: health → k6 smoke → Playwright → ZAP baseline.

## 1. Health

```bash
curl -sS -o - -w "\nHTTP %{http_code}\n" https://alleone-teste.alletecnologia.com/api/health
```

Esperado: `200` e JSON `ok`.

Na VM: `pm2 monit` / logs `alleone-teste-api` e `alleone-teste-web`.

## 2. Desempenho (k6)

Já existe: [`deploy/load/k6-alleone-smoke.js`](../deploy/load/k6-alleone-smoke.js). Login **1x por execução** (throttle de login ~10/min).

Instalar: [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) (Windows: `winget install k6` ou Chocolatey).

Smoke (PowerShell, na raiz do repo):

```powershell
k6 run deploy/load/k6-alleone-smoke.js `
  -e BASE_URL=https://alleone-teste.alletecnologia.com `
  -e USER_EMAIL='usuario-de-teste@alletecnologia.com' `
  -e USER_PASSWORD='***' `
  -e VUS=5 `
  -e DURATION=2m
```

Com dashboard (grupo Zabbix da empresa):

```powershell
k6 run deploy/load/k6-alleone-smoke.js `
  -e BASE_URL=https://alleone-teste.alletecnologia.com `
  -e USER_EMAIL='...' -e USER_PASSWORD='...' `
  -e ZABBIX_GROUP='NomeDoGrupoZabbix' `
  -e VUS=5 -e DURATION=2m
```

2FA: `-e TOTP_CODE=123456` (código **atual**).

Carga um pouco maior (ainda teste): `VUS=20`, `DURATION=5m`, `SLEEP=0.5`.

Critérios no script: `http_req_failed < 5%`, p95 `< 3s`, falha de login `< 1%`.

Detalhes: [deploy/load/README.md](../deploy/load/README.md) · caches em [PERFORMANCE.md](./PERFORMANCE.md).

## 3. UI (Playwright)

Existe em `frontend/e2e/`. Sem sessão, o smoke **não precisa** de senha.

| Spec | O que cobre | Precisa login? |
|------|-------------|----------------|
| `login.spec.ts` | Formulário + rotas protegidas → `/login` | Não |
| `tickets.spec.ts` | Lista de tickets | Sim (`E2E_WITH_API=1`) |
| `apontamento.spec.ts` | Agenda de apontamentos | Sim |
| `gmud-approve.spec.ts` | Fila GMUD | Sim |
| `inventario-import.spec.ts` | Inventário | Sim |
| `console-ack.spec.ts` | Console | Sim |

Instalar browser (uma vez):

```powershell
cd frontend
npx playwright install chromium
```

Smoke **sem API** (sobe o Next local, ou aponte para teste):

```powershell
cd frontend
npx playwright test e2e/login.spec.ts --grep "exibe formulário|redireciona"
```

Contra a **base de teste** (pula o `npm run dev`):

```powershell
cd frontend
$env:PLAYWRIGHT_SKIP_WEBSERVER = "1"
$env:PLAYWRIGHT_BASE_URL = "https://alleone-teste.alletecnologia.com"
npx playwright test e2e/login.spec.ts --grep "exibe formulário|redireciona"
```

Fluxos autenticados (usuário de **teste**, não prod):

```powershell
cd frontend
$env:PLAYWRIGHT_SKIP_WEBSERVER = "1"
$env:PLAYWRIGHT_BASE_URL = "https://alleone-teste.alletecnologia.com"
$env:E2E_WITH_API = "1"
$env:E2E_USER = "usuario-de-teste@alletecnologia.com"
$env:E2E_PASSWORD = "***"
npx playwright test e2e/login.spec.ts e2e/tickets.spec.ts e2e/apontamento.spec.ts e2e/gmud-approve.spec.ts
```

Modo visual: `npm run test:e2e:ui`.

Se a conta exige 2FA, o helper atual **não** envia TOTP — use uma conta de teste sem 2FA ou complete o login à mão no `--ui`.

## 4. Segurança (OWASP ZAP)

Não havia script no repo. Baseline (spider + scan **passivo**) está em [`deploy/security/`](../deploy/security/README.md).

Requer Docker. Só na URL de teste:

```powershell
.\deploy\security\zap-baseline.ps1
```

Relatório: `deploy/security/out/zap-report.html`.

Não use `zap-full-scan` / scan autenticado agressivo no primeiro passe: login tem throttle e o spider autenticado pode criar ruído (tickets, GMUD). Comece pelo baseline público (`/login`, `/api/health`).

Depois de puxar o código na VM, **recarregue o Nginx** (`nginx-alleone-teste-https.conf` + snippets) e rebuild da web/API; senão o ZAP continua vendo os headers antigos.

O que o baseline público deve melhorar: CSP nas páginas (antes ausente), HSTS/`nosniff` em `robots.txt`, sem `X-Powered-By`, redirect `/` e `/api` sem corpo HTML grande, CSP da API sem coringa `https:`.

Ainda esperado (médio): `'unsafe-inline'` em `script-src`/`style-src` nas páginas (RSC do Next, React, `next/font`). Fora isso, o próximo passo é scan autenticado (conta de teste **sem 2FA**), não Pen Test em produção.

Checklist manual complementar: [SECURITY.md](./SECURITY.md) (cookies Secure, Swagger off, CORS, uploads).

## 5. Backend unitário / e2e Nest

```powershell
cd backend
npm test
# e2e Nest (sobe AppModule; não substitui Playwright)
npm run test:e2e
```

O `test/app.e2e-spec.ts` é um hello-world antigo — para UI/API reais, use k6 + Playwright.
