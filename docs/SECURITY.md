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

## Scan OWASP ZAP (teste)

Baseline passivo (spider + alertas passivos) só em `alleone-teste`:

```powershell
.\deploy\security\zap-baseline.ps1
```

Roteiro completo (k6, Playwright, ZAP): [TESTES_DESEMPENHO_SEGURANCA.md](./TESTES_DESEMPENHO_SEGURANCA.md).  
Não rode full scan autenticado em produção.

Relatórios HTML em `deploy/security/` **não** entram no Git.

### Headers no Nginx (após git pull na VM)

Os achados de médio/baixo do ZAP (CSP ausente nas páginas, HSTS/`X-Content-Type-Options` em `robots.txt`, `X-Powered-By`, redirect `/` com corpo grande) são cobertos por:

- `deploy/nginx-alleone-security-headers.snippet.conf`
- `deploy/nginx-alleone-csp-html.snippet.conf` (páginas; `'unsafe-inline'` em script/style por causa do Next/React/`next/font`)
- `deploy/nginx-alleone-csp-api.snippet.conf` (API; sem coringa `https:` e sem `unsafe-inline`)

Na **teste**:

```bash
sudo cp /home/alleone/teste/deploy/nginx-alleone-teste-https.conf /etc/nginx/sites-available/alleone-teste
sudo nginx -t && sudo systemctl reload nginx
```

Rebuild/restart `alleone-teste-web` e `alleone-teste-api` para Helmet + `poweredByHeader: false` + `theme-boot.js`.

Não aplique o conf de teste em produção. Produção usa `deploy/nginx-alleone-https.conf` no mesmo ciclo de deploy habitual.

## Incidentes

1. Revogar token vazado na origem (TiFlux, Zabbix, SMTP).
2. Rotacionar `JWT_SECRET` (invalida sessões ativas).
3. Auditar `audit_logs` no Postgres se suspeita de uso indevido.
