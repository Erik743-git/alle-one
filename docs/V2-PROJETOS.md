# V2 — Módulo Projetos (integração com Tickets e Apontamentos)

## Estado atual (MVP — implementado)

| Item | Status |
|------|--------|
| CRUD de projetos por empresa | ✅ |
| Atividades hierárquicas (WBS, sub-atividades, predecessoras) | ✅ |
| Gantt + tabela com marcar concluída | ✅ |
| Export/Import Excel (modelo em branco e preenchido) | ✅ |
| Orçamento de tempo (horas ou dias) por projeto | ✅ |
| Bloqueio de conclusão quando excede orçamento → aprovação ADMIN | ✅ |
| Documentação anexa (PDF/Word) na criação e no detalhe | ✅ |
| Responsável da atividade (usuário do portal ou texto livre) | ✅ |

**Modelos:** `Project`, `ProjectActivity`, `ProjectActivityPredecessor`, `ProjectDocument`.
**Orçamento:** `Project.budgetUnit` (HOURS/DAYS) + `Project.budgetAmount`. Consumo derivado de `ProjectActivity.actualDurationDays` (ou duração quando 100%). Jornada base: **8h/dia**.
**Aprovação:** `Project.completionApprovalStatus` (NOT_REQUIRED/PENDING/APPROVED/REJECTED) + `completionApprovedBy/At/Note`.

---

## V2 planejado — integração Ticket ↔ Apontamento ↔ Atividade

### Objetivo
Eliminar o retrabalho: o usuário aponta **uma vez** no chamado e o projeto/Gantt se
atualiza sozinho. O tempo do apontamento **abate** o tempo da atividade e o
**responsável** da atividade passa a ser quem fez o apontamento.

### Regras de negócio pretendidas
1. **Projeto ↔ Ticket**: um projeto pode estar relacionado a um chamado
   (TiFlux/Portal). Uma atividade pode referenciar o mesmo ticket.
2. **Apontamento abate atividade**: cada apontamento associado a uma atividade
   soma no `tempo real` (`actualDurationDays`/horas) e recalcula `% andamento`.
3. **Responsável automático**: o autor do apontamento vira o
   responsável/executor da atividade (sem preencher manualmente).
4. **Fonte única de tempo**: o tempo vem do apontamento; edição manual de
   `actualDurationDays` passa a ser exceção/ajuste.
5. **Orçamento em tempo real**: consumo do projeto reflete os apontamentos
   automaticamente; mantém o gate de aprovação ADMIN ao exceder.

### Mudanças de modelo (rascunho)
- `Project.ticketNumber` (Int?) ou tabela `ProjectTicketLink` (N projetos ↔ N tickets).
- `ProjectActivity.ticketNumber` (Int?) — atividade ligada a um chamado.
- `ProjectActivityAppointment` — junção entre `ProjectActivity` e
  `PortalTicketAppointment` (ou `tiflux.ticket_appointments`), guardando
  `minutes` e `userId` para abater tempo e definir responsável.
- Possível enum/flag para distinguir tempo **manual** vs **derivado de apontamento**.

### Pontos de integração no código
- `backend/src/modules/projetos/projetos.service.ts` — recalcular consumo a partir
  dos apontamentos vinculados; `computeBudgetMetrics` passaria a somar minutos reais.
- `backend/src/modules/tickets/tickets.service.ts` —
  `saveAppointmentFiles`/criação de apontamento dispara vínculo com a atividade.
- `PortalTicketAppointment` (schema) — origem do tempo e do autor.
- Frontend: ao apontar no ticket, permitir escolher a **atividade do projeto**;
  na tela do projeto, exibir apontamentos que compõem cada atividade.

### Sincronização
- Reaproveitar o padrão outbox/reconcile já usado em V2-Tickets para manter
  consistência entre apontamento (portal/TiFlux) e atividade do projeto.

### Riscos / decisões em aberto
- Conversão minutos ↔ dias (manter 8h/dia? configurável por empresa?).
- Recalcular `% andamento` automático vs manual.
- Apontamento sem atividade (ticket sem projeto) — manter comportamento atual.
- Edição manual após vínculo (travar ou permitir ajuste com auditoria).

> Origem: solicitação de 25/06/2026 — "o projeto vai estar relacionado com um
> ticket e os apontamentos vão abater o tempo das atividades; o responsável vai
> ser quem fez o apontamento, para não ter que fazer duas coisas ao mesmo tempo".
