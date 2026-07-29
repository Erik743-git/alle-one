# V2 — Módulo Projetos (integração com Tickets e Apontamentos)

## Estado atual (implementado)

| Item | Status |
|------|--------|
| CRUD de projetos por empresa | ✅ |
| Atividades hierárquicas (WBS, sub-atividades, predecessoras) | ✅ |
| Gantt + tabela com marcar concluída | ✅ |
| Export/Import Excel | ✅ |
| Orçamento de tempo (horas/dias) + aprovação ADMIN ao exceder | ✅ |
| Documentação anexa no projeto | ✅ |
| Responsável da atividade (usuário ou texto) | ✅ |
| **Projeto ↔ 1 ticket** (`Project.ticketNumber`) | ✅ |
| **Atividade ↔ apontamentos portal** (`ProjectActivityAppointment`) | ✅ |
| Ao apontar no ticket: escolher atividade do projeto | ✅ |
| Na tela do projeto: vincular / listar apontamentos do ticket | ✅ |
| Recalcular horas/responsável da atividade a partir dos vínculos | ✅ |

Checklist detalhado: [`V2-PROJETOS-ESPECIFICACAO.md`](./V2-PROJETOS-ESPECIFICACAO.md).

**Arquivos principais**

```text
backend/src/modules/projetos/projetos.service.ts
frontend/components/projetos/project-ticket-appointments-panel.tsx
frontend/components/tickets/ticket-appointment-modal.tsx  # projectActivityId
```

## Objetivo da integração (já atendido no fluxo portal)

O usuário aponta **uma vez** no chamado; a atividade do projeto abate tempo e pode herdar o responsável do apontamento.

## Gaps aceitos / backlog

| Gap | Nota |
|-----|------|
| Só `PortalTicketAppointment` | Apontamentos **somente espelho TiFlux** (sem `portalAppointmentId`) não entram na junção até o cutover/ETL |
| 1 ticket por projeto | Não há N:N (`ProjectTicketLink`) |
| Sem `ProjectActivity.ticketNumber` | Ticket fica no projeto, não por atividade |
| Docs antigos | A seção “V2 planejado” abaixo foi substituída por este status |

## Sincronização

- Apontamentos portal usam o mesmo padrão tickets/outbox TiFlux quando habilitado.
- Cutover: ver [`CUTOVER_TIFLUX.md`](./CUTOVER_TIFLUX.md).

## Riscos operacionais

- Conversão minutos ↔ dias (jornada 8h/dia).
- Apontamento sem atividade (ticket sem projeto) — comportamento atual mantido.
- Edição no TiFlux de apontamento já vinculado ao portal — preferir editar no portal após cutover.

---

*Atualizado jul/2026 — alinhado à especificação e ao código em produção/staging.*
