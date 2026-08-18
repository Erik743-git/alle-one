# Load / smoke — k6 (Alle One)

Script: [`k6-alleone-smoke.js`](./k6-alleone-smoke.js)

Cobre **login (cookie `alleone_access`)** + **me** + **tickets** + **GMUD** + **dashboard/complete** (opcional).

## Pré-requisitos

1. Instalar [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/)
2. Usar ambiente de **teste** (não produção com VUs altos)
3. Usuário com permissão de ver dashboard, tickets e GMUD

## Smoke (recomendado)

```bash
cd /caminho/do/repo

k6 run deploy/load/k6-alleone-smoke.js \
  -e BASE_URL=https://alleone-teste.alletecnologia.com \
  -e USER_EMAIL='seu@email.com' \
  -e USER_PASSWORD='***' \
  -e ZABBIX_GROUP='NomeDoGrupoZabbixDaEmpresa' \
  -e COMPANY_ID='uuid-da-empresa' \
  -e VUS=2 \
  -e DURATION=1m \
  -e SLEEP=3
```

### Variáveis

| Env | Obrigatório | Descrição |
|-----|-------------|-----------|
| `BASE_URL` | sim | Origem pública (sem `/api`) |
| `USER_EMAIL` / `USER_PASSWORD` | sim | Login senha |
| `TOTP_CODE` | se 2FA | Código atual do autenticador |
| `ZABBIX_GROUP` | para dashboard | Sem isso o script **pula** `/dashboard/complete` |
| `COMPANY_ID` | não | UUID; senão tenta do `/auth/me` |
| `VUS` | não | Default `2` |
| `DURATION` | não | Default `1m` |
| `SLEEP` | não | Pausa entre iterações (s), default `3` |

## Carga um pouco maior (ainda em teste)

```bash
k6 run deploy/load/k6-alleone-smoke.js \
  -e BASE_URL=https://alleone-teste.alletecnologia.com \
  -e USER_EMAIL='...' -e USER_PASSWORD='...' \
  -e ZABBIX_GROUP='...' \
  -e VUS=20 -e DURATION=5m -e SLEEP=0.5
```

Observe na VM: `pm2 monit`, CPU/memória de `alleone-teste-api` / `alleone-teste-web`, e p95 no relatório do k6.

## Limites úteis

- Login tem **throttle** (~10/min): o script autentica **1x por execução** (`setup()`), não a cada iteração.
- A API tem **throttle global ~200 req/min**. Smoke com `VUS=5` e `SLEEP=1` gera 429 e falha `http_req_failed`. Use `VUS=2 SLEEP=3` no ambiente de teste.
- k6 não expõe `URLSearchParams`; o script monta a query do dashboard à mão.
- Não use senha de produção em chat/CI; prefira usuário de teste.
- Se `http_req_failed` ou `alleone_authed_fail` subir, olhe o primeiro aviso `[k6] ... HTTP` (401/429/5xx).

## Ver também

- [PERFORMANCE.md](../../docs/PERFORMANCE.md) — caches dashboard / Redis
- [TESTES_DESEMPENHO_SEGURANCA.md](../../docs/TESTES_DESEMPENHO_SEGURANCA.md) — k6 + Playwright + ZAP
