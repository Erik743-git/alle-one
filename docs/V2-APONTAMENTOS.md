# V2 — Apontamentos (visão colaborador + empresarial)

Renomeação de **Rendimento** → **Apontamentos** no menu. O módulo `RENDIMENTO` no Prisma/permissões permanece (compatibilidade).

## Perfis e rotas

| Perfil | Rota | Visão |
|--------|------|--------|
| **Colaborador** | `/rendimento/{userId}` | Agenda pessoal (mês/semana/dia), lacunas, HE/plantão, justificativas |
| **Admin** | `/rendimento` | Toggle **Colaboradores** / **Empresas** |
| **Admin** | `/rendimento/empresa/{companyId}` | Agenda empresarial (calendário) |
| **Cliente** | redirect → `/rendimento/empresa/{companyId}` | Só a própria empresa |

## Visão empresarial (cliente + admin)

- Apontamentos por empresa (`tiflux.tickets.client_external_id` ↔ `companies.tiflux_client_id`).
- Merge **TiFlux sync** + **portal-only** (`portal_ticket_appointments`).
- Calendário mês/semana/dia com totais de horas e indicadores de **questionamentos pendentes**.
- Descrições longas (listagens coladas) resumidas no card; expansão opcional.

### Questionamentos (cliente → gestores)

| Ação | Quem | Detalhe |
|------|------|---------|
| Questionar | `CLIENT` | 1 questionamento por apontamento; justificativa obrigatória (mín. 10 caracteres) |
| E-mail | Sistema | Todos os `ADMIN` ativos ao questionar |
| Responder | `ADMIN` | Texto + checkbox **Abonar** + link **Editar ticket** |
| Status | UI | Pendente / Respondido / Abonado |

Tabela: `rendimento_appointment_questions` (migrations `20260811120000`, `20260812120000`).

## API — visão empresarial

| Método | Rota | Papéis |
|--------|------|--------|
| GET | `/rendimento/companies` | ADMIN, CLIENT |
| GET | `/rendimento/companies/:companyId/agenda` | ADMIN, CLIENT |
| GET | `/rendimento/companies/:companyId/questions` | ADMIN |
| POST | `/rendimento/companies/:companyId/questions` | CLIENT |
| PATCH | `/rendimento/questions/:id/answer` | ADMIN |

Lista de empresas (admin): **horas no mês** + contagem de **questionamentos pendentes** + painel para responder.

## Justificativas de lacuna (colaborador)

- **ALERT** (lacuna) e **VOLUNTARY**: colaborador com `RENDIMENTO.canView` na própria agenda.
- Guard `ModulePermissionGuard`: `canEdit` dispensado para `kind` ALERT/VOLUNTARY quando `canView` está ativo.

## Arquivos principais

```text
backend/src/modules/rendimento/
  rendimento-company.service.ts
  rendimento-mail.service.ts
  company-description.util.ts
frontend/app/rendimento/
  page.tsx                    # admin: colaboradores / empresas
  empresa/[companyId]/page.tsx
frontend/components/rendimento/
  company-agenda-calendar.tsx
  company-pending-questions-dialog.tsx
  admin-answer-question-dialog.tsx
```

## Deploy

```bash
cd backend && npx prisma migrate deploy
```

Migrations V2 apontamentos: `20260811120000_rendimento_appointment_questions`, `20260812120000_rendimento_question_abonado`.

---

*Documento vivo — jun/2026.*
