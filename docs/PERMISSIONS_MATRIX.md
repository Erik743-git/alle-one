# Matriz de permissões — Alle One

Fonte de verdade operacional: combinação de `@Roles` + `@RequirePermission` no backend e `frontend/lib/access-control.ts` no front.  
Fallbacks por role: `backend/src/modules/permissions/permissions.service.ts` (`ROLE_FALLBACK`).  
Regras de produto extras: `ModulePermissionGuard`.

Legenda: **V** view · **C** create · **E** edit · **D** delete · **A** approve · — sem acesso · ◐ só com flag na matriz / escopo

---

## Tickets (`TICKETS`)

| Ação | ADMIN | COLLABORATOR / PJ | CLIENT |
|------|-------|-------------------|--------|
| Menu / listar | V | V (fallback) | V (fallback) — escopo empresa TiFlux |
| Detalhe / histórico | V | V | V — só tickets da empresa |
| Criar ticket (`POST /tickets`) | C | — | — |
| Apontar / estágio | C | C (matriz `canCreate`) | — |
| Reconciliar / link GMUD | E/C | — | — |

**Decisão de produto:** menu e lista alinhados ao `canView`. CLIENT nunca vê tickets de outras empresas (`TenantScopeService`).

---

## Demais módulos (resumo)

| Módulo | ADMIN | COLLABORATOR | PJ | CLIENT |
|--------|-------|--------------|-----|--------|
| DASHBOARD | full | V | V | V (escopo empresa) |
| GMUD | full | matriz | matriz | matriz (aprovar se `canApprove`) |
| RENDIMENTO / Apontamentos | full | V (+ justificativa) | V | V (se não revogado) |
| CORREIO | full | V | V | — |
| INVENTARIO | full | matriz | matriz | V (default) |
| FINANCIAL | full | matriz | matriz | V (default) |
| PROJECTS | full | matriz | matriz | V (matriz) |
| REPORTS | full | — (guard) | — | — |
| ADMIN / USERS / PERMISSIONS / COMPANIES | full | — | — | — |
| MONITORING (Console) | full | matriz | matriz | — |

---

## Como alterar

1. Preferir ajustar `@Roles` + `@RequirePermission` no controller.
2. Só usar hard-rule no `ModulePermissionGuard` para política global (ex.: REPORTS).
3. Espelhar UX em `access-control.ts` (`canAccess*`, `canCreate*`).
4. Atualizar esta matriz e `docs/V2-TICKETS.md` na mesma mudança.

---

*Atualizado em jul/2026 — alinhamento Tickets CLIENT + apontamento COLLABORATOR/PJ.*
