# V2 — Módulo Tickets (substituição gradual do TiFlux)

## Decisão de arquitetura — **Opção A** (aprovada)

**Cutover:** ver [CUTOVER_TIFLUX.md](./CUTOVER_TIFLUX.md) — `portal_tickets` + flags `TICKETS_PORTAL_CANONICAL` / `TICKETS_TIFLUX_WRITE`.

| Camada | Estratégia |
|--------|------------|
| **Leitura canônica (default)** | `tiflux.tickets` + `tiflux.ticket_appointments` (sync `alleone-tiflux-sync`) |
| **Leitura canônica (flag)** | `portal_tickets` quando `TICKETS_PORTAL_CANONICAL=true` |
| **Escrita apontamento** | Portal → `portal_ticket_appointments` (`PORTAL_ONLY` por padrão) |
| **Sync TiFlux apontamento** | Opcional: `TIFLUX_APPOINTMENT_SYNC_ENABLED=true` + outbox |
| **Escrita ticket** | Sempre `portal_tickets`; API TiFlux se `TICKETS_TIFLUX_WRITE=true` (default) |
| **Cutover futuro** | ETL + dual-read → desligar sync/API |

**Criar ticket:** somente ADMIN.  
**Listar / detalhe:** ADMIN, COLLABORATOR, PJ, CLIENT com `TICKETS.canView` (CLIENT escopado à empresa).  
**Apontar:** ADMIN ou colaborador/PJ com `TICKETS.canCreate`.

Ver matriz completa: [PERMISSIONS_MATRIX.md](./PERMISSIONS_MATRIX.md).

---

## Implementado

| Item | Status |
|------|--------|
| Lista, detalhe, catálogos, anexos portal | ✅ |
| `POST /tickets` — dual-write TiFlux (S4) | ✅ |
| `POST /tickets/:n/appointments` — portal + outbox TiFlux (S3b) | ✅ |
| `POST /tickets/reconcile` — divergências portal vs espelho (S5) | ✅ |
| Job outbox (API ou PM2 `alleone-outbox`) | ✅ |
| Colaborador/PJ apontar com permissão | ✅ |
| CLIENT listar/detalhar tickets da empresa | ✅ |
| UI `frontend/app/tickets/` | ✅ |
| `portal_tickets` + dual-write/dual-read (flags) | ✅ |
| ETL `tiflux.tickets` → `portal_tickets` | ✅ |

---

## API

| Método | Rota | Papéis |
|--------|------|--------|
| GET | `/tickets` | ADMIN, COLLABORATOR, PJ, CLIENT + canView |
| GET | `/tickets/:ticketNumber` | ADMIN, COLLABORATOR, PJ, CLIENT + canView |
| POST | `/tickets` | ADMIN + canCreate |
| POST | `/tickets/:ticketNumber/appointments` | ADMIN, COLLABORATOR, PJ + canCreate |
| POST | `/tickets/reconcile?retry=true` | ADMIN + canEdit |
| POST | `/admin/reprocess-tiflux-outbox` | ADMIN |

Guards: `@Roles` + `@RequirePermission(TICKETS, …)`.  
CLIENT: filtro forçado por `company.tifluxClientId` (tenant).

---

## Reconciliação (S5)

`POST /tickets/reconcile` retorna:

- Outbox `FAILED` e `PENDING` antigo
- Apontamentos `PENDING_TIFLUX`
- Apontamentos `SYNCED` sem registro em `tiflux.ticket_appointments`

Com `?retry=true`, reenfileira FAILED e processa lote.

---

## Deploy

```bash
cd backend && npx prisma migrate deploy && npm run build
cd ../frontend && npm run build
```

Worker outbox opcional: `deploy/OUTBOX_WORKER.md`, `deploy/ecosystem.config.example.js`.

---

*Documento vivo — jul/2026.*
