# Roteiro local — Portal cliente v3 (06/08/2026)

Ambiente: **local** (`frontend` :3000 · API conforme `PORT` no `backend/.env`, tipicamente **3002**).

> **Pack na empresa:** Admin → Empresas → **Editar** (não na listagem). Seção “Módulos contratados”. Hard refresh se não aparecer.

Objetivo: validar packs/roles, multi-empresa, dashboard dual + presets, apontamentos do gestor e financeiro Alle — **sem regressão no staff Alle**.

---

## 0) Subir o ambiente

Abra **3 terminais** (PowerShell).

### Terminal A — Postgres + Redis

```powershell
cd C:\PortalAlle\alle-one\backend
docker compose up -d
docker compose ps
```

### Terminal B — API

```powershell
cd C:\PortalAlle\alle-one\backend

# Se migrate falhar em enum UserRole (Postgres), rode antes:
# Get-Content scripts\add-client-roles-enum.sql -Raw | docker exec -i alleone_postgres psql -U alle -d alleone

npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

Confirme health (ajuste a porta do seu `.env`):

```powershell
curl.exe http://127.0.0.1:3002/health
# ou
curl.exe http://127.0.0.1:3003/health
```

Esperado: `{"ok":true,...,"database":"up",...}`

### Terminal C — Frontend

```powershell
cd C:\PortalAlle\alle-one\frontend
npm run dev
```

Abra: http://localhost:3000

> Se a API não responder, confira `NEXT_PUBLIC_API_URL` em `frontend/.env.local` (deve bater com `PORT` do backend).

---

## 1) Preparar dados (Admin Alle)

Login com **ADMIN**.

### 1.1 Empresa piloto A

1. Admin → Empresas → editar empresa **A**
2. Marcar módulos do pack (mínimo: Dashboard, Tickets, Financeiro, Rendimento/Apontamentos)
3. Salvar
4. Confirmar integração Zabbix (grupo) se for testar gráficos de monitoramento

### 1.2 Usuários na empresa A

| Usuário | Papel | Empresa |
|---------|-------|---------|
| gestor-a@… | Cliente (gestor) | A |
| func-a@… | Cliente (funcionário) | A |

### 1.3 Multi-empresa (mesmo e-mail)

No Swagger (`/docs`) ou via curl, com token ADMIN:

```http
PUT /users/{idDoGestor}/memberships
{
  "companyId": "{uuidEmpresaB}",
  "clientRole": "CLIENT_GESTOR"
}
```

Empresa B também precisa ter pack com Dashboard/Tickets.

Alternativa SQL (banco local):

```sql
INSERT INTO user_companies (id, user_id, company_id, client_role, created_at, updated_at)
VALUES (
  gen_random_uuid()::text,
  '<user_id_gestor>',
  '<company_b_id>',
  'CLIENT_GESTOR',
  NOW(),
  NOW()
)
ON CONFLICT (user_id, company_id) DO NOTHING;
```

---

## 2) Checklist — Gestor (empresa A)

Login como **gestor**.

| # | Onde | Esperado | OK? |
|---|------|----------|-----|
| G1 | Sidebar | Só módulos do pack | ☐ |
| G2 | Abaixo de “Alle One” | Nome da **empresa A** | ☐ |
| G3 | Switcher | Com 2 empresas: botão trocar; com 3+: dialog | ☐ |
| G4 | Trocar para B | Recarrega; empresa B ativa; tickets/dashboard mudam de escopo | ☐ |
| G5 | Voltar para A | Escopo A de novo | ☐ |
| G6 | Chamados | Título tipo “Chamados da empresa”; lista da empresa | ☐ |
| G7 | Novo chamado | Consegue abrir (se TICKETS no pack) | ☐ |
| G8 | Apontamentos | Lista **funcionários** (CLIENT_MEMBER), **não** roster Alle | ☐ |
| G9 | Apontamentos → Ver chamados | Abre tickets filtrando e-mail do funcionário | ☐ |
| G10 | Financeiro | Texto “Atendimento Alle…” / agenda Alle | ☐ |
| G11 | Dashboard | Toggle **Visão Alle** / **Visão interna** | ☐ |
| G12 | Visão Alle | Totais/gráficos de tickets “Alle” (+ horas se houver) | ☐ |
| G13 | Visão interna | Foco em tickets criados por CLIENT_*; horas Alle somem/zeram | ☐ |
| G14 | Editar gráfico | Tipo (barra/linha/pizza), mesas, período → Salvar | ☐ |
| G15 | F5 após preset | Preferência permanece na mesma visão | ☐ |

---

## 3) Checklist — Funcionário

Login como **func-a**.

| # | Onde | Esperado | OK? |
|---|------|----------|-----|
| F1 | Sidebar | Sem Financeiro / Apontamentos / Inventário / Projetos (pack MEMBER default) | ☐ |
| F2 | Switcher | Só aparece se tiver 1+ memberships; sem 2ª empresa, só mostra a ativa | ☐ |
| F3 | Chamados | “Meus chamados” — só os dele | ☐ |
| F4 | Novo chamado | Cria e aparece na própria lista | ☐ |
| F5 | Gestor (outro browser) | Vê o chamado do funcionário na lista da empresa | ☐ |
| F6 | Dashboard | Visão interna reflete ticket criado pelo funcionário | ☐ |

---

## 4) Checklist — Staff Alle (não regressão)

Login **ADMIN** ou **COLLABORATOR**.

| # | Onde | Esperado | OK? |
|---|------|----------|-----|
| A1 | Sidebar | Sem switcher de empresa cliente | ☐ |
| A2 | Dashboard | Sem toggle Alle/interna; seletor de empresa (admin/collab) funciona | ☐ |
| A3 | Apontamentos | Lista colaboradores Alle (como antes) | ☐ |
| A4 | Financeiro | Agenda empresa; copy admin intacta | ☐ |
| A5 | Tickets | Cross-company / filtros habituais OK | ☐ |

---

## 5) Falhas comuns

| Sintoma | Checagem |
|---------|----------|
| Front 401 / login loop | Cookie + `NEXT_PUBLIC_API_URL` vs `PORT` |
| Migração faltando | `npx prisma migrate deploy` — ver `20260806140000_user_companies_dashboard_presets` |
| Prisma `userCompany` / `dashboardChartPreset` inexistente | `npx prisma generate` + restart API |
| Switcher não aparece | Role CLIENT_* + `companies[]` no `/auth/me` |
| Dashboard interno vazio | Precisa tickets `origin=PORTAL` com `created_by` de usuário CLIENT_* |
| Apontamentos gestor vazio | Precisa `user_companies` com `CLIENT_MEMBER` na empresa ativa |
| Gráficos zerados | Empresa sem `tifluxClientId` / tickets sem `created_at_source` / Zabbix group |

---

## 6) Ordem sugerida (30–40 min)

1. Subir stack (§0)  
2. Admin: pack + usuários (§1)  
3. Gestor: menu, apontamentos, financeiro (§2 G1–G10)  
4. Dashboard dual + preset (§2 G11–G15)  
5. Multi-empresa switch (§2 G3–G5)  
6. Funcionário (§3)  
7. Smoke staff (§4)  

Critério de pronto: **todos os ☐ marcados** sem regressão Alle.
