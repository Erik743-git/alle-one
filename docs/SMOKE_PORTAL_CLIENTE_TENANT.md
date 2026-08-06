# Smoke — portal cliente tenant (piloto)

Ambiente: teste (`alleone-teste`).

## Preparar

1. `prisma migrate deploy` (migrations `20260806120000_*` + `20260806140000_user_companies_dashboard_presets`)
2. Restart `alleone-teste-api` / web
3. Admin Alle → Empresas → editar empresa piloto → marcar módulos contratados → salvar
4. Admin → Usuários:
   - 1× `Cliente (gestor)` na empresa
   - 1× `Cliente (funcionário)` na mesma empresa (mesmo domínio de e-mail se MFA/TOTP permitir)
5. (Multi-empresa) Vincular o mesmo e-mail gestor a uma 2ª empresa em `user_companies` (ou via admin quando UI de membership existir) e confirmar papéis distintos

## Gestor

- Login → sidebar só com módulos do pack
- Abaixo de Alle One: nome da empresa; com 2 empresas, botão switch; com 3+, dialog
- Chamados: título **Chamados da empresa**; vê tickets da empresa
- Novo chamado habilitado (se TICKETS no pack)
- **Apontamentos:** lista de funcionários (não roster Alle); link “Ver chamados”
- **Financeiro:** agenda rotulada como atendimento Alle
- **Dashboard:** toggle Visão Alle / Visão interna; Editar gráfico (tipo, mesas, período) persiste após F5

## Funcionário

- Login → sem Financeiro / Rendimento / Inventário / Projetos (default MEMBER)
- Chamados: **Meus chamados** (só requestor / criador / cópia)
- Pode abrir chamado; após criar, aparece na própria lista
- Dashboard visão interna conta tickets criados por CLIENT_*

## Staff Alle

- Sem mudança de menu / cross-company
- Dashboard sem toggle cliente; seletor de empresa admin/collab intacto
