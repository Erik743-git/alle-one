# V2 — Módulo Tickets (substituição gradual do TiFlux)

## Decisão de arquitetura — **Opção A** (aprovada)

| Camada | Estratégia |
|--------|------------|
| **Leitura canônica (agora)** | `tiflux.tickets` + `tiflux.ticket_appointments` populados pelo sync `alleone-tiflux-sync` |
| **Escrita apontamento (atual)** | **Somente portal** — `portal_ticket_appointments` (`PORTAL_ONLY`); sem POST TiFlux |
| **Escrita ticket / retry (futuro)** | `portal_tiflux_outbox` + API TiFlux quando cutover |
| **Cutover futuro** | ETL único `tiflux.*` → tabelas `public` quando divergência = 0 por período acordado |

**Não fazer agora:** `portal_tickets` espelhando todo o catálogo em paralelo.

**V2.0 — somente ADMIN** cria ticket e aponta pelo portal. Colaboradores continuam no TiFlux até fase posterior.

---

## Referência TiFlux (telas enviadas)

| Área | O que replicar na V2 |
|------|----------------------|
| Lista | Tickets agrupados por **estágio** (Pendente, Aguardando usuário, Em execução) |
| Lista | Colunas: número, título, cliente, origem, prioridade, status, estágio |
| Filtros | Meus tickets; filtros salvos (fase 2); busca avançada |
| Busca avançada | Período (abertura), número, título, status, cliente, solicitante, atendente, mesa, estágio |
| Detalhe | Abas: Informações gerais, **Apontamentos** (MVP); demais abas depois |
| Apontamento | Painel lateral: dia, início/fim, tipo (HORA NORMAL/EXTRA/PLANTÃO), atendimento, descrição, anexos portal |
| Ações | Fechar ticket, transferir, etc. — **fora do MVP** |

---

## O que já existe no Alle One

- Permissão `TICKETS` no Prisma e painel admin de permissões.
- Sync em `tiflux.tickets` / `tiflux.ticket_appointments`.
- Apontamentos (rendimento), dashboard, correio e relatórios **consumem** apontamentos do sync.
- Módulo `tiflux` no backend (GET legado).

### Implementado

| Item | Status |
|------|--------|
| Migration `portal_tiflux_outbox` | ✅ |
| Migration `portal_ticket_appointments` | ✅ |
| Migration `portal_ticket_appointment_attachments` | ✅ |
| `backend/src/modules/tickets/` — lista, detalhe, catálogos, criar apontamento portal | ✅ |
| `GET /tickets`, `GET /tickets/catalogs/filters`, `GET /tickets/:ticketNumber` | ✅ |
| `POST /tickets/:ticketNumber/appointments` — grava só no portal (`PORTAL_ONLY`) | ✅ |
| Merge leitura: sync TiFlux + apontamentos portal no detalhe | ✅ |
| Anexos por apontamento (portal) | ✅ |
| `frontend/app/tickets/` — lista, busca avançada, novo ticket | ✅ |
| `frontend/app/tickets/[ticketNumber]/` — detalhe + painel apontamento (Sheet) | ✅ |
| Sidebar **Tickets** + `canAccessTickets()` | ✅ |
| Visão empresarial + questionamentos — ver [V2-APONTAMENTOS.md](./V2-APONTAMENTOS.md) | ✅ |

### Pendente

| Item | Fase |
|------|------|
| Dual-write apontamento → API TiFlux + outbox retry | **S3b** (opcional pós-MVP) |
| `POST /tickets` criar ticket dual-write | **S4** |
| Reconciliação portal vs `tiflux.*` | **S5** |
| Colaborador apontar pelo portal | Fase posterior |

---

## Arquitetura (Opção A)

```text
Frontend /tickets
    → Backend modules/tickets
        → Leitura: tiflux.tickets / tiflux.ticket_appointments (sync)
        → Leitura portal: portal_ticket_appointments (+ anexos)
        → Escrita apontamento: portal_ticket_appointments (PORTAL_ONLY)
        → Escrita futura: portal_tiflux_outbox → TiFlux API
    ← alleone-tiflux-sync → tiflux.* (espelho)
```

### Tabelas `public`

| Tabela | Função |
|--------|--------|
| `portal_tiflux_outbox` | Fila futura: CREATE_TICKET, sync retry |
| `portal_ticket_appointments` | Apontamentos criados no portal (status `PORTAL_ONLY`) |
| `portal_ticket_appointment_attachments` | Anexos do portal (não vão ao TiFlux) |
| `rendimento_appointment_questions` | Questionamentos visão empresarial |

---

## API (backend)

| Método | Rota | Status |
|--------|------|--------|
| GET | `/tickets` | ✅ |
| GET | `/tickets/catalogs/filters` | ✅ |
| GET | `/tickets/:ticketNumber` | ✅ |
| POST | `/tickets/:ticketNumber/appointments` | ✅ portal-only |
| POST | `/tickets` | S4 |
| POST | `/tickets/reconcile` | S5 |

Guards: `@Roles('ADMIN')` + `@RequirePermission(TICKETS, canView|canCreate|canEdit)`.

---

## Fases de entrega

| Fase | Entrega | Status |
|------|---------|--------|
| **S1** | Migrations outbox + backend leitura (`tiflux.*`) | ✅ |
| **S2** | UI lista + busca avançada + detalhe leitura | ✅ |
| **S3** | Criar apontamento no portal + merge leitura + anexos | ✅ |
| **S3b** | Dual-write TiFlux + outbox retry | Opcional |
| **S4** | Criar ticket dual-write | — |
| **S5** | Reconciliação + painel divergências | — |

---

## Riscos e decisões

1. **Apontamento portal-only:** API TiFlux v2 exige mesa sem valorização; Alle adotou gravação só no portal até cutover.
2. **Mapeamento usuário portal ↔ TiFlux:** e-mail → `tiflux.users.external_id`.
3. **Leitura sync:** latência de minutos até worker atualizar `tiflux.*`.
4. **IDs:** número exibido = `tiflux.tickets.ticket_number`.

---

## Deploy

```bash
cd backend && npx prisma migrate deploy && npm run build
cd ../frontend && npm run build
```

Migrations V2 tickets: `20260808120000` … `20260810120000`.

---

*Documento vivo — Opção A; apontamento portal-only jun/2026.*
