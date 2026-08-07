# Análise de melhorias — Alle One

Documento gerado em **02/07/2026** para revisão posterior.  
Versão do produto na época: **0.6.0**.

---

## Diagnóstico resumido

O Alle One é um portal corporativo maduro (Next.js + NestJS + PostgreSQL) com integrações **Zabbix** e **TiFlux**. GMUD, apontamentos, dashboard e inventário estão estáveis; Console, Projetos e Tickets V2 estão em evolução.

Principais oportunidades:

1. Consistência de permissões e roteamento Nginx/API
2. Console como centro operacional (ack completo, ticket a partir do alerta)
3. Integração entre módulos (alerta → ticket → apontamento → projeto)
4. Segurança e auditoria proporcionais ao dado
5. Testes E2E e quebra de services monolíticos (~3000 linhas)

---

## 1. Segurança

### Prioridade alta

| Melhoria | Motivo | Ação |
|----------|--------|------|
| Proteger `GET /health/integrations` | Endpoint público expõe estado do sync TiFlux e outbox | ✅ Token interno (`HEALTH_INTEGRATIONS_TOKEN`) ou ADMIN |
| Alinhar permissões Tickets (CLIENT vs ADMIN) | Menu visível mas API `GET /tickets` só ADMIN | ✅ Lista/detalhe com canView; CLIENT escopado |
| Upload com validação real | MIME vem do cliente | ✅ Magic bytes + limite por tipo (`assertAllowedUpload`) |
| Migrar Nginx para `/api` | Whitelist quebra a cada módulo novo | ✅ Configs `/api` no repo; aplicar em prod na janela |
| Auditoria mais ampla | Só ADMIN em mutações com `@AuditMeta` | ✅ `@AuditMeta` audita qualquer role autenticada |
| Corrigir `ON CONFLICT` no Rendimento | Migration parcial vs código antigo | ✅ Índice parcial + upsert com `WHERE deleted_at IS NULL` |

### Prioridade média

- Rate limit por usuário/empresa (não só global 200/min)
- CSRF explícito em mutações sensíveis
- Rotação documentada de tokens Zabbix/TiFlux
- Desabilitar `TIFLUX_UNSAFE_ENDPOINTS` em prod no startup ✅
- S3 obrigatório em prod para anexos
- 2FA (TOTP) para ADMIN

### Estratégico (Fase 3 roadmap)

- Redis (cache + filas)
- Sentry + OpenTelemetry
- Secret manager

---

## 2. Usabilidade

### Console

- Update completo do problema (ack, mensagem, severidade, suppress, close) via `event.acknowledge`
- Histórico de reconhecimentos no detalhe
- Som/toast só em Desastre/Alta em empresas prioritárias
- Filtro salvo por usuário (“visão NOC”)
- Modo NOC (layout para TV/monitor)
- Atalhos de teclado (R refresh, A ack)

### Admin / Empresas

- Colunas configuráveis na tabela
- Bulk: marcar várias empresas como prioritárias no Console
- Wizard onboarding (empresa + Zabbix + TiFlux)

### Apontamentos / Financeiro

- Timer de apontamento (iniciar/pausar)
- Resumo semanal para colaborador
- Export PDF da agenda para cliente

### GMUD

- Timeline visual do fluxo
- Templates por tipo (rede, app, banco)
- Lembrete 24h antes da janela

### Inventário

- Alertas de vencimento no correio + badge no menu
- QR code por ativo
- Dashboard vencimentos 30/60/90 dias

### Projetos

- Gantt interativo com drag de datas
- % do projeto pelas atividades filhas
- Integração ticket ↔ apontamento ↔ atividade (Fase 3)

### Transversal

- Busca global (empresa, ticket, host, GMUD, ativo)
- Mensagens de erro acionáveis (não só “Serviço não encontrado”)
- PWA / push para aprovações pendentes

---

## 3. Features criativas e úteis

### Integração entre módulos

| Feature | Descrição |
|---------|-----------|
| Ticket a partir do alerta | Console pré-preenche host, problema, empresa, severidade |
| GMUD ↔ ticket | UI mais visível no detalhe do ticket |
| Inventário no ticket | Ativo do host ao atender chamado |
| Runbook por trigger | Tag Zabbix → procedimento interno |

### Inteligência operacional

- Score “empresa em risco” (alertas + GMUD + contrato)
- Detecção de flapping (mesmo host, N problemas/hora)
- Sugestão de causa raiz por grupo Zabbix
- Previsão de estouro de contrato (usage-alerts)

### Para o cliente

- Portal unificado (saúde Zabbix + tickets + GMUD + inventário)
- Relatório mensal automático (PDF/e-mail)
- SLA visual no financeiro
- Aprovação GMUD one-click no e-mail

### Para equipe interna

- Plantão / escala com notificação de Desastre
- Import CRM → inventário
- Comparador de ambientes Zabbix

---

## 4. Dívida técnica

| Item | Impacto |
|------|---------|
| `dashboard.service.ts` (~1150; hours/charts/integrations extraídos) | Continuar fatiar orquestração complete |
| `tickets.service.ts` (~320; query/catalogs/appointments extraídos) | Create ticket + GMUD restantes |
| `rendimento.service.ts` / `reports.service.ts` / `projetos.service.ts` | Fatias iniciais extraídas (overtime, inventario reports, docs) |
| Poucos testes E2E | ✅ Smoke E2E: login + GMUD/apontamento/console/inventário (skip sem API) |
| Sync TiFlux externo obrigatório | Fundação cutover: `portal_tickets` + flags — ver CUTOVER_TIFLUX.md |

**Sugestão:** extrair services por domínio + 5 fluxos E2E: login, GMUD approve, apontamento, Console ack, import inventário.

---

## 5. Roadmap sugerido (90 dias)

### Sprints 1–2 — Estabilização produção

1. Nginx `/api` ou validação automática de rotas ✅ (configs; deploy prod pendente)
2. Fix Rendimento `ON CONFLICT` ✅
3. Permissões Tickets CLIENT ✅
4. Proteger `/health/integrations` ✅
5. Console ack completo (Zabbix) ✅ (close/suppress + message)

### Sprints 5–6 — Escala e qualidade

1. E2E dos 5 fluxos críticos ✅ (smoke + skip sem API)
2. Refatorar `tickets.service` ✅ (query/catalogs/appointments)
3. S3 + Sentry em prod (Fase 3)
4. Projeto ↔ apontamento
5. Relatório mensal cliente
6. Cutover TiFlux — `portal_tickets` ✅ fundação; validar staging

---

## 6. Quick wins (1–3 dias cada)

1. Aumentar `sleep` no health do pós-deploy ✅
2. Documentar matriz ROLE × MÓDULO × ação ✅ (`docs/PERMISSIONS_MATRIX.md`)
3. Badge “sync stale” no header ✅
4. “Copiar host/problema” no detalhe do Console ✅
5. Commit ordenação Console + fix coluna Ações empresas ✅

---

## Referências

- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/ROADMAP_2026.md`
- `deploy/POS_DEPLOY_OPERACIONAL.md`
- `deploy/MIGRACAO_NGINX_API.md`

---

*Atualize este documento conforme itens forem implementados ou descartados.*
