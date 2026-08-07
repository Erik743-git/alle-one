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
  -e VUS=5 \
  -e DURATION=2m
```

### Variáveis

| Env | Obrigatório | Descrição |
|-----|-------------|-----------|
| `BASE_URL` | sim | Origem pública (sem `/api`) |
| `USER_EMAIL` / `USER_PASSWORD` | sim | Login senha |
| `TOTP_CODE` | se 2FA | Código atual do autenticador |
| `ZABBIX_GROUP` | para dashboard | Sem isso o script **pula** `/dashboard/complete` |
| `COMPANY_ID` | não | UUID; senão tenta do `/auth/me` |
| `VUS` | não | Default `5` |
| `DURATION` | não | Default `2m` |
| `SLEEP` | não | Pausa entre iterações (s), default `1` |

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

- Login tem **throttle** (~10/min): o script autentica **1x por VU**, não a cada iteração.
- Não use senha de produção em chat/CI; prefira usuário de teste.
- Se `http_req_failed` ou `alleone_authed_fail` subir, olhe status 401/429/5xx no output do k6.

## Ver também

- [PERFORMANCE.md](../../docs/PERFORMANCE.md) — caches dashboard / Redis
