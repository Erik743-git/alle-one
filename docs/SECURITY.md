# Segurança — Alle One

## Segredos e Git

- **Nunca** commite `backend/.env`, `frontend/.env.local` ou `.env` na raiz.
- Apenas `**/.env.example` entra no repositório.
- Histórico verificado: arquivos `.env` reais **não aparecem** no `git log` (somente exemplos).
- Se um segredo já circulou em chat ou e-mail, **rote** JWT, tokens TiFlux/Zabbix, SMTP e senha do banco.

## Produção (checklist)

| Item | Ação |
|------|------|
| `JWT_SECRET` | 32+ caracteres aleatórios; obrigatório na subida |
| `CORS_ORIGINS` / `FRONTEND_URL` | URL exata do site (sem barra final) |
| `SWAGGER_ENABLED` | `false` (padrão) |
| `AUTH_COOKIE_SECURE` | `false` só em HTTP sem TLS; em HTTPS use cookie Secure |
| `TRUST_PROXY` | `1` atrás de Nginx |
| Uploads | MIME + **magic bytes**; limites por tipo; `backend/uploads/` fora do Git |
| `HEALTH_INTEGRATIONS_TOKEN` | Token para `GET /health/integrations` (cron); sem token só ADMIN |
| Backup DB | `deploy/scripts/backup-postgres.sh` + retenção via cron (ver [MAINTENANCE.md](./MAINTENANCE.md)) |
| Debug | `ENABLE_DEBUG_DUMP` desligado em produção |

## Autenticação

- JWT em cookie httpOnly + validação em guards (`JwtAuthGuard`, `ModulePermissionGuard`).
- Rate limit global via `@nestjs/throttler`.
- Endpoints de debug do dashboard bloqueados em produção.
- `GET /health` público; `GET /health/integrations` exige token interno ou ADMIN.

## Auditoria

- Interceptor global grava mutações `POST|PUT|PATCH|DELETE`.
- Rotas com `@AuditMeta`: qualquer role autenticada (ex.: GMUD approve, Console ack, import inventário).
- Demais mutações: somente `ADMIN`.

## Integrações

- Tokens TiFlux e Zabbix apenas em variáveis de ambiente.
- Sync TiFlux: serviço **externo** `alleone-tiflux-sync` (não embutido no portal).

## CI

- Build backend + testes unitários (helpers rendimento) + build frontend.
- Sem secrets no workflow; `DATABASE_URL` fictícia só para `prisma generate`.

## Incidentes

1. Revogar token vazado na origem (TiFlux, Zabbix, SMTP).
2. Rotacionar `JWT_SECRET` (invalida sessões ativas).
3. Auditar `audit_logs` no Postgres se suspeita de uso indevido.
