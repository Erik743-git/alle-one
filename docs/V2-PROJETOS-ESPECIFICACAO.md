# V2 Projetos — Especificação (fases, horas, apontamentos, histórico)

**Versão:** 1.0 · **Data:** 03/07/2026  
**Status:** Em implementação (Fase 1 iniciada)

Documento de referência para a refatoração do módulo Projetos. Complementa `docs/V2-PROJETOS.md` (integração ticket/apontamento).

---

## 1. Visão geral

### Hierarquia fixa (3 níveis + apontamentos)

```
Projeto (ticket vinculado)
└── Fase (nível 1) — sem prazo/duração próprios
    └── Atividade ou Marco (nível 2) — duração em HORAS
        └── Apontamentos (nível 3) — do ticket ou criados no projeto
```

### Princípios

| Regra | Descrição |
|-------|-----------|
| Fases | Container organizacional; prazo derivado das atividades filhas |
| Atividades | Sempre vinculadas a uma fase; planejamento em **horas** |
| Marco | Atividade com **0h** — ponto de controle no cronograma |
| Predecessoras | Atividade só inicia se **todas** as predecessoras estiverem **concluídas** |
| Projeto fechado | `COMPLETED` / `CANCELED` = somente leitura até **reabrir** (ADMIN) |
| Histórico | Timeline de tudo criado/alterado/excluído no projeto |

---

## 2. Marco (milestone)

**Marco** = evento de controle **sem duração** (0 horas).

- Exemplos: "Cliente aprovou", "Go-live", "Entrega da documentação"
- Não soma horas no orçamento da fase
- Pode ser marcado como concluído como qualquer atividade
- No formulário: checkbox "Marco (duração zero)"

Diferente de **atividade normal**, que tem duração planejada (ex.: 8h) e pode receber apontamentos.

---

## 3. Fase

### Campos

- Nome (obrigatório)
- Ordem / WBS nível 1 (ex.: `1`, `2`, `3`)
- Notas (opcional)
- **Sem** `durationHours`, `startDate`, `endDate`

### Derivados (calculados)

- Início da fase = menor `startDate` das atividades filhas
- Fim da fase = maior `endDate` das atividades filhas
- Horas planejadas = soma `durationHours` das atividades (exceto marcos)
- % da fase = média ponderada das atividades filhas
- **Fase concluída** quando todas as atividades filhas estão `COMPLETED`

### UI

- Botão principal no projeto: **"Adicionar fase"**
- Dentro da fase: **"Adicionar atividade"**

---

## 4. Atividade (tarefa)

### Campos

| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| `phaseId` (parentId) | UUID | Sim |
| Nome | string | Sim |
| Duração planejada | horas (int) | Sim (0 se marco) |
| Início / término | data+hora ou data | Conforme planejamento |
| Responsável | usuário ou texto | Não |
| Predecessoras | lista de IDs | Não (padrão: anterior na fase) |
| Status | NOT_STARTED / IN_PROGRESS / COMPLETED | Automático |
| Marco | boolean | Não |

### Predecessoras

1. Ao **adicionar atividade**, marcar por padrão a **atividade anterior da mesma fase** como predecessora.
2. Usuário pode alterar: qualquer atividade do projeto (outra fase permitida).
3. Múltiplas predecessoras permitidas.
4. **Bloqueio:** não permitir `IN_PROGRESS` ou progresso > 0 se alguma predecessora não estiver `COMPLETED`.

### Conclusão

- Checkbox / botão **"Concluída"** → `status = COMPLETED`, `progressPercent = 100`, `completedAt = now()`
- Fase atualiza status derivado automaticamente

---

## 5. Apontamentos (nível 3)

### Fontes

1. **Criar** apontamento na tela do projeto → grava no ticket + vincula à atividade
2. **Vincular** apontamento existente do ticket do projeto
3. Apontamentos já vinculados aparecem na atividade (já existe `ProjectActivityAppointment`)

### Efeitos

- Soma em `actualDurationHours` (ou minutos)
- Autor do apontamento pode virar responsável da atividade (regra V2 existente)
- Recalcula % andamento do projeto

---

## 6. Projeto fechado e reabertura

| Status | Edição |
|--------|--------|
| `PLANNING`, `IN_PROGRESS`, `ON_HOLD` | Permitida (quem tem `canEdit`) |
| `COMPLETED`, `CANCELED` | **Bloqueada** — somente visualização e export |
| Reabrir | ADMIN → `IN_PROGRESS` + registro no histórico |

---

## 7. Histórico do projeto

### Endpoint

`GET /projetos/projects/:projectId/history`

### Eventos (timeline estilo TiFlux)

- Projeto criado / alterado / fechado / reaberto
- Fase criada / alterada / excluída
- Atividade criada / alterada / concluída / excluída
- Predecessora adicionada/removida
- Apontamento vinculado / desvinculado
- Responsável alterado

### Modelo

`project_history` — `eventType`, `summary`, `payload` (JSON), `actorUserId`, `createdAt`

---

## 8. Histórico do ticket (fase posterior)

Mesmo padrão visual do TiFlux (aba Histórico):

- Mudança de status/estágio
- Responsável
- Apontamentos
- Vínculo GMUD / projeto

*Tabela `ticket_history` ou extensão da auditoria — Fase 5.*

---

## 9. Modelo de dados (alterações)

### Enums novos

```prisma
enum ProjectActivityKind {
  PHASE
  TASK
  MILESTONE
}

enum ProjectActivityStatus {
  NOT_STARTED
  IN_PROGRESS
  COMPLETED
}
```

### `ProjectActivity` (campos novos)

- `kind` — PHASE | TASK | MILESTONE
- `durationHours` — nullable (null em fase)
- `actualDurationHours` — nullable
- `activityStatus` — NOT_STARTED | IN_PROGRESS | COMPLETED
- `completedAt` — DateTime?

### Migração de dados existentes

- Raiz (`parentId` null) → `kind = PHASE`
- `isMilestone = true` → `kind = MILESTONE`
- Demais → `kind = TASK`
- `durationHours = durationDays * 8`

---

## 10. API (novos/alterados)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/projetos/projects/:id/phases` | Criar fase |
| POST | `/projetos/projects/:id/activities` | Criar atividade (exige `parentId` = fase) |
| POST | `/projetos/projects/:id/reopen` | Reabrir projeto (ADMIN) |
| GET | `/projetos/projects/:id/history` | Timeline do projeto |
| POST | `/projetos/activities/:id/complete` | Marcar concluída |
| POST | `/projetos/activities/:id/appointments/link` | Vincular apontamento existente |

---

## 11. Plano de implementação

### Fase 1 — Fundação (em andamento)

- [x] Especificação documentada
- [x] Migration Prisma (`kind`, `durationHours`, `activityStatus`, `project_history`)
- [x] `POST .../phases` + validação hierarquia
- [x] Duração em horas no formulário de atividade
- [x] Botão "Adicionar fase" na UI
- [x] Bloqueio de edição em projeto `COMPLETED`/`CANCELED`
- [x] Histórico básico (create/update/delete) — backend; UI na Fase 4
- [x] Predecessora padrão = anterior na fase (backend)
- [x] Validação predecessoras concluídas antes de iniciar (backend)
- [x] `POST reopen` (ADMIN)

### Fase 2 — Predecessoras e conclusão

- [x] Padrão predecessora = anterior na fase (backend + UI)
- [x] Validação predecessoras concluídas antes de iniciar
- [x] Status de fase derivado (progresso, datas, conclusão automática)
- [x] UI predecessoras melhorada (coluna, chips, bloqueio no checkbox)
- [x] `POST /activities/:id/complete` para marcar concluída

### Fase 3 — Apontamentos

- [x] Listar apontamentos do ticket no projeto
- [x] Vincular apontamentos existentes
- [x] Criar apontamento na tela do projeto (via modal do ticket)
- [x] Recalcular horas reais (`actualDurationHours`, progresso, fase, responsável)

### Fase 4 — Histórico completo + reabrir

- [ ] Aba Histórico no frontend (timeline)
- [ ] `POST reopen`
- [ ] Filtros e export PDF (opcional)

### Fase 5 — Ticket histórico + Excel

- [ ] Histórico no ticket
- [ ] Import/export Excel alinhado ao modelo fase/atividade/horas

**Estimativa total:** ~114–156h (3–4 semanas)

---

## 12. Referências

- `docs/V2-PROJETOS.md` — integração ticket/apontamento (parcialmente implementada)
- `docs/ANALISE_MELHORIAS_PROJETO.md` — roadmap geral
- `backend/prisma/schema.prisma` — modelos `Project*`
- `frontend/app/projetos/[companyId]/[projectId]/page.tsx` — tela do projeto
