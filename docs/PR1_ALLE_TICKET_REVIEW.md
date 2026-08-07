# Revisão — PR #1 (`alle-ticket`) vs branch cutover / v0.6.0

**PR:** [#1 feat: adding images to tickets description](https://github.com/Erik743-git/alle-one/pull/1)  
**Head:** `alle-ticket` · **Base:** `main` · **Autor:** yancostasc  
**Estado (jul/2026):** OPEN, mergeable; CI **backend FAIL**, frontend/e2e-smoke OK.

## O que o PR mexe

| Arquivo | Nota |
|---------|------|
| `appointment-description-composer.tsx` | Diff grande (~+761/−233) — composer com imagens |
| `appointment-description-view.tsx` | Ajustes de view |
| `apontamentos/[userId]/page.tsx` | UX apontamentos |
| Migrations `portal_appointment_sync_paused` | Overlap com cutover |
| `mailbox-kind-filter-modal`, `install-hint` | Mudanças menores |

## Overlap com `feat/cutover-tiflux-hardening-20260727` (v0.6.0)

A branch de cutover **já inclui** composer/view de apontamento com imagens (`__ALLEONE_DOC_V1__`), edit-context, anexos e sync paused. Mergear o PR #1 **em cima de main antigo** ou **sem rebase** tende a:

1. Conflitos pesados no composer
2. Duplicar comportamento já estabilizado na v0.6.0
3. Reintroduzir trechos que a cutover já corrigiu (CI backend no PR falhou)

## Recomendação

1. **Não mergear o PR #1 como está** na `main` de produção sem rebase.
2. Autor (ou nós): rebase `alle-ticket` em `feat/cutover-tiflux-hardening-20260727` (ou `main` após merge da cutover) e **reavaliar o diff restante**.
3. Manter só commits que ainda agreguem algo **além** do que já está na cutover (ex.: UX específica de `/apontamentos/[userId]` se ainda faltar).
4. Corrigir o job CI **backend** antes do merge.

## Alternativa operacional

Se o objetivo do PR era “imagens na descrição do apontamento”, isso **já está entregue** na v0.6.0 — fechar o PR com comentário apontando a release e convidar o autor a abrir PR só com o delta útil pós-rebase.
