# Changelog

Todas as mudanças relevantes do **Alle One** são documentadas neste arquivo.

O versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/) (`MAJOR.MINOR.PATCH`). A versão canônica do repositório está em [`VERSION`](VERSION).

## [Unreleased]

_Nada pendente._

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
