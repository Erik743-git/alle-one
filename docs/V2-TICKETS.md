# V2 — Módulo Tickets (substituição gradual do TiFlux)

## Decisão de arquitetura — **Opção A** (aprovada)

| Camada | Estratégia |
|--------|------------|
| **Leitura canônica** | `tiflux.tickets` + `tiflux.ticket_appointments` (sync `alleone-tiflux-sync`) |
| **Escrita apontamento** | Portal → `portal_ticket_appointments` (`PORTAL_ONLY` por padrão) |
| **Sync TiFlux apontamento** | Opcional: `TIFLUX_APPOINTMENT_SYNC_ENABLED=true` + outbox |
| **Escrita ticket** | `POST /tickets` → API TiFlux + outbox `CREATE_TICKET` (auditoria SYNCED) |
| **Cutover futuro** | ETL único `tiflux.*` → `public` quando divergência = 0 |

**Criar ticket:** somente ADMIN. **Apontar:** ADMIN ou colaborador/PJ com `TICKETS.canCreate`.

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
| UI `frontend/app/tickets/` | ✅ |

---

## API

| Método | Rota | Papéis |
|--------|------|--------|
| GET | `/tickets` | ADMIN |
| GET | `/tickets/:ticketNumber` | ADMIN, COLLABORATOR, PJ |
| POST | `/tickets` | ADMIN |
| POST | `/tickets/:ticketNumber/appointments` | ADMIN, COLLABORATOR, PJ + canCreate |
| POST | `/tickets/reconcile?retry=true` | ADMIN + canEdit |
| POST | `/admin/reprocess-tiflux-outbox` | ADMIN |

Guards: `@Roles` + `@RequirePermission(TICKETS, …)`.

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

*Documento vivo — jun/2026.*
