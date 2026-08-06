# Portal cliente v3 — análise e plano

## Análise (faz sentido? quebra Alle?)

| Ideia | Veredito | Risco | Notas |
|-------|----------|-------|-------|
| Dashboard dual (Alle vs interno) | Sim | Médio | Filtro por `created_by` (staff vs CLIENT_*); horas só na visão Alle |
| Gráficos sem TiFlux + mesas | Sim | Médio | Leitura de `portal_tickets` / desks; TiFlux runtime continua opt-in |
| Editar gráfico + preset salvo | Sim | Baixo | `dashboard_chart_presets` por `(userId, companyId, viewMode)` |
| Apontamentos gestor = funcionários | Sim | Médio | Lista `CLIENT_MEMBER` via membership; Alle fica em Financeiro |
| Financeiro = o que a Alle faz | Sim | Baixo | Copy “Atendimento Alle”; agenda company intacta |
| E-mail em 2+ empresas | Sim | **Alto** | `user_companies` + `POST /auth/switch-company` + JWT ativa |

**Seguro para Alle:** staff ignora pack/switcher; `User.companyId` espelha a ativa para CLIENT_*; seletor admin/collab intacto.

**Não fazer:** ACL por mesa; duplicar usuário por e-mail.

## Segurança (pré-deploy)

- Switch empresa: só `CLIENT_*`, membership obrigatória, `tokenVersion++`
- Pack / memberships: endpoints ADMIN
- Pack UI: Admin → Empresas → **Editar** (não na listagem)

## Deploy teste

Ver [`DEPLOY_PORTAL_CLIENTE_V3_TESTE.md`](./DEPLOY_PORTAL_CLIENTE_V3_TESTE.md).

## Status implementação

1. Membership + switch API — feito
2. Sidebar switcher — feito
3. Escopo tenant pela ativa — feito
4. Dashboard dual + presets — feito
5. Apontamentos/financeiro — feito
6. Smoke / deploy docs — feito
