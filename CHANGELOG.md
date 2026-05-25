# Changelog

Todas as mudanças relevantes do **Alle One** são documentadas neste arquivo.

O versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/) (`MAJOR.MINOR.PATCH`). A versão canônica do repositório está em [`VERSION`](VERSION).

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

[0.3.0]: https://github.com/Erik743-git/alle-one/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Erik743-git/alle-one/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Erik743-git/alle-one/releases/tag/v0.1.0
