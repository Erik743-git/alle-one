# Changelog

Todas as mudanças relevantes do **Alle One** são documentadas neste arquivo.

O versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/) (`MAJOR.MINOR.PATCH`). A versão canônica do repositório está em [`VERSION`](VERSION).

## [Unreleased]

## [0.6.0] — 2026-07-28

### E-mail → pré-tickets (Microsoft Graph)

- Poll da caixa compartilhada M365 → `pre_tickets` (cron ~1 min + BullMQ/Redis opcional).
- Admin **E-mail** (`/admin/email`): recebimento, rotas, **Buscar**, remetentes bloqueados (`IGNORED`).
- Lista **Pré-tickets**: linha inteira clicável, badge no menu, anexos (contagem + ações).
- **Abrir ticket** gera `portal_tickets` (canal E-mail) com anexos/imagens do pré-ticket.
- Upload ampliado: RAR/7z, Office, TXT (+ magic-bytes / fallback por extensão).

### Auth / segurança

- **2FA TOTP** (setup, login `2FA_REQUIRED`, confiança 14 dias, desativar com senha+código).
- Guard de sessão ociosa no frontend; integração opcional **Sentry** (API + Next).

### Tickets e apontamentos

- Edição de ticket (`/tickets/.../edit`): HTML de e-mail, remoção de anexos, solicitante livre.
- Composer de apontamento com imagens/anexos; edição com `edit-context` + PATCH de arquivos.
- Validação de horário (fim ≠ início; default +15 min); alertas TiFlux removidos do modal.
- Cutover: flags `TICKETS_PORTAL_CANONICAL` / `TICKETS_TIFLUX_WRITE`, ETL sync final, helper portal appointment.

### Rendimento (apontamentos na agenda)

- Listagem sem JSON/`base64` cru (`hasMedia`, `portalAppointmentId`, texto plano).
- Ícone de caixa → dialog com imagens/anexos e download.
- Card do apontamento abre o ticket; ícone de mídia e botões de HE não interferem.

### UX listas

- Linha inteira clicável em **Tickets** e **Pré-tickets**.

### Migrações

- `20260727180000_email_preticket_2fa`
- `20260728180000_email_blocked_senders`
- `20260810120100_portal_appointment_sync_paused_ensure`

### Documentação

- [`docs/EMAIL_PRETICKET_GRAPH.md`](docs/EMAIL_PRETICKET_GRAPH.md)
- Atualizações em cutover, tickets, apontamentos e versionamento.

## [0.5.0] — 2026-06-02

### GMUD

- Correção dos filtros na lista (empresa `ALL`, acordeões vazios).
- Exportação PDF com logos (`GET /gmuds/:id/pdf`, `pdfkit`).
- Botão **Exportar PDF** no detalhe da GMUD.

### Tickets

- **GMUD do cliente**: campo textual `externalGmudRef` (sem FK para GMUD interna).
- Lista, filtro, criação e edição de ticket atualizados.
- Apontamentos com **descrição rica** (blocos texto + imagem, formato `__ALLEONE_DOC_V1__`).
- Preview de prints em **base64** (`preview_data_base64`) e download corrigido (`StreamableFile`).
- UI: miniaturas, modal, texto compacto com expansão.

### Apontamentos (admin)

- Hub com cards: colaboradores, HE pendentes, **justificativas pendentes** (voluntária / alerta).
- Nova rota `/apontamentos/aprovar-justificativas`.
- API: `GET /rendimento/justifications/pending`, `PATCH /rendimento/justifications/bulk-decision`.
- Descrição compacta na aprovação de HE (`CompactExpandableText`).

### Auth (opcional)

- OAuth Google e Microsoft (`auth-oauth.service`, variáveis `OAUTH_*`).

### Migrações

- `20260817120000_user_microsoft_id`
- `20260818120000_portal_ticket_gmud_links`
- `20260819120000_ticket_external_gmud_ref`
- `20260820120000_appointment_attachment_preview`

### Deploy

- Roteiro: [`deploy/RELEASE_0.5.0.md`](deploy/RELEASE_0.5.0.md)

### TiFlux outbox e performance

- Worker cron para `CREATE_APPOINTMENT` (portal → TiFlux); retry em `POST /admin/reprocess-tiflux-outbox`.
- Relatórios: busca de apontamentos TiFlux em paralelo (até 6 tickets).
- Dashboard: tipos e utilitários de data extraídos (`dashboard.types.ts`, `dashboard-date.utils.ts`).

### Testes e frontend

- Specs: `ModulePermissionGuard`, `PermissionsService.buildRequestUser`, `mapWithConcurrency`.
- `ErrorBoundary` global; admin usuários via `usersService` / `companiesService`.

### Segurança e operação

- `buildRequestUser` rejeita usuários com `deletedAt`.
- Health check com teste de Postgres; deploy falha se API unhealthy.
- Validação MIME em uploads de contratos, logos e anexos de tickets.
- Script `deploy/scripts/backup-postgres.sh`.

### Permissões e UX

- Inventário e Tickets alinhados entre menu, página e API.
- Tickets na matriz de permissões do admin.
- Labels **Apontamentos** em relatórios; mensagem clara no `PermissionGate`.

### Frontend e infra

- `API_URL` centralizado em `@/lib/env` (porta 3002 em dev).
- Menos chamadas duplicadas a `/auth/me`.
- Nginx: rota `/inventario/attachments/*`.
- Documentação: `docs/MAINTENANCE.md`.

## [0.4.0] — 2026-06-02

### Adicionado — V2 Tickets (ADMIN)

- Módulo **Tickets**: lista agrupada por estágio, busca avançada, detalhe do ticket.
- Apontamento pelo portal (painel lateral): data, horários, tipo, atendimento, descrição, anexos.
- Tabelas `portal_ticket_appointments`, `portal_ticket_appointment_attachments`, `portal_tiflux_outbox`.
- Merge de apontamentos sync TiFlux + portal-only no detalhe do ticket.
- Rotas `/tickets`, `/tickets/new`, `/tickets/[ticketNumber]`; menu **Tickets** (somente admin).

### Adicionado — V2 Apontamentos (empresarial)

- Menu **Rendimento** renomeado para **Apontamentos**.
- Visão empresarial: admin (todas empresas) e cliente (própria empresa); calendário mês/semana/dia.
- Questionamentos de apontamento pelo cliente; e-mail aos gestores; resposta admin (texto, abonar, editar ticket).
- Tabela `rendimento_appointment_questions`; lista de empresas com horas no mês e questionamentos pendentes.
- Documentação: `docs/V2-TICKETS.md`, `docs/V2-APONTAMENTOS.md`.

### Alterado

- Permissão `RENDIMENTO` para perfil **CLIENT** (visão empresarial).
- Justificativa de lacuna (**ALERT**): colaborador com `canView` pode justificar na própria agenda (fix permissão).

### Migrações

- `20260808120000_portal_tiflux_outbox`
- `20260809120000_portal_appointment_attachments`
- `20260810120000_portal_ticket_appointments`
- `20260811120000_rendimento_appointment_questions`
- `20260812120000_rendimento_question_abonado`

## [0.3.0] — 2026-05-22

### Adicionado

- Categoria **Consult** no dashboard e no relatório gerencial Tipo 4.
- Componentes de select com busca: `ZabbixGroupSelectField`, `TifluxClientSelectField`.
- `DateTimePickerField` na GMUD (data + hora) e duração em horas.
- Tema de gráficos (`chart-theme`, `use-app-theme`) e container adiado para Recharts.
- Sidebar fixo com contexto (`sidebar-context`) e animação ao recolher.

### Alterado

- UX do modo claro (alertas, badges, botões destrutivos, GMUD, admin, financeiro).
- Modal de nova empresa: rodapé com espaçamento; selects Zabbix/TiFlux pesquisáveis.
- Modal de editar usuário mais largo.
- Lista completa de grupos Zabbix (sem filtro por `/`).

### Documentação

- Arquitetura, versionamento e este changelog.

## [0.2.0] — 2026-05 (checkpoint anterior)

### Adicionado

- Dashboard Zabbix: alertas High/Disaster, cache, refresh manual, abas de hosts/triggers.
- Relatório gerencial Tipo 4 (Excel) com abas de monitoramento e triggers.
- `DatePickerField` customizado no dashboard e gerador de relatórios.
- Variáveis `DASHBOARD_COMPLETE_CACHE_MS`, `ENABLE_DEBUG_DUMP` documentadas.

## [0.1.0] — 2026-05

### Adicionado

- Estrutura inicial: monorepo `backend` (NestJS + Prisma) e `frontend` (Next.js).
- Módulos base: Auth, Users, Companies, Permissions, GMUD, Contracts, Financial, Reports, Dashboard, Zabbix, TiFlux, Usage Alerts.
- CI com build de backend e frontend.

[0.4.0]: https://github.com/Erik743-git/alle-one/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Erik743-git/alle-one/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Erik743-git/alle-one/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Erik743-git/alle-one/releases/tag/v0.1.0
