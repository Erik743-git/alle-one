# Roteiro de validação — Portal cliente v3 + Especialidade (06/08/2026)

Ambiente sugerido: **local** (`http://localhost:3000` + API `:3002`) ou **teste** após deploy.

**Legenda:** ☐ pendente · ✅ ok · ⚠ parcial / bug

---

## 0) Pré-requisitos

| # | Ação | ☐ |
|---|------|---|
| 0.1 | `docker compose up -d` (Postgres) | ☐ |
| 0.2 | `npx prisma migrate deploy` no backend (inclui packs + user_companies; se existir `specialty_domain`, aplicar também) | ☐ |
| 0.3 | `npm run start:dev` (API) + `npm run dev` (front) | ☐ |
| 0.4 | `curl.exe http://127.0.0.1:3002/health` → ok | ☐ |
| 0.5 | Login **ADMIN** Alle | ☐ |

> **Escopo do dia:**  
> **A — Portal cliente v3** (commit `8bde097`, já no remoto) → testável agora.  
> **B — Especialidade / cobrança** (em andamento no working tree) → testar só o que a UI já mostrar; relatório completo pode ainda estar incompleto.

---

# A) Portal cliente v3 (testar primeiro)

## A1. Admin — Pack e papéis

| # | Passo | Esperado | ☐ |
|---|--------|----------|---|
| A1.1 | Admin → Empresas → **Editar** empresa piloto | Seção **“Módulos contratados”** | ☐ |
| A1.2 | Marcar/salvar pack (Dashboard, Tickets, Financeiro, Rendimento…) | Persiste ao reabrir | ☐ |
| A1.3 | Admin → Usuários → criar **Cliente (gestor)** na empresa A | Role gestor + empresa | ☐ |
| A1.4 | Criar **Cliente (funcionário)** na mesma empresa | Role member | ☐ |
| A1.5 | (Opcional multi-empresa) 2ª empresa no mesmo gestor via `PUT /users/{id}/memberships` | Membership OK | ☐ |

## A2. Gestor do cliente

Login como **gestor** (outro browser / aba anônima).

| # | Passo | Esperado | ☐ |
|---|--------|----------|---|
| A2.1 | Sidebar | Só módulos do pack | ☐ |
| A2.2 | Abaixo de Alle One | Nome da empresa ativa | ☐ |
| A2.3 | Com 2 empresas | Botão trocar; com 3+ dialog | ☐ |
| A2.4 | Trocar empresa | Recarrega; tickets/dashboard mudam de escopo | ☐ |
| A2.5 | Chamados | Lista da **empresa** (não só os dele) | ☐ |
| A2.6 | **Novo chamado** | Consegue abrir | ☐ |
| A2.7 | Apontamentos | Lista **funcionários** (não roster Alle) | ☐ |
| A2.8 | Apontamentos → Ver chamados | Filtra pelo e-mail do funcionário | ☐ |
| A2.9 | Financeiro | Copy **Atendimento Alle** / agenda Alle | ☐ |
| A2.10 | Dashboard | Toggle **Visão Alle** / **Visão interna** | ☐ |
| A2.11 | Editar gráfico | Tipo, mesas/período, salva; F5 mantém | ☐ |

## A3. Funcionário do cliente

Login como **funcionário**.

| # | Passo | Esperado | ☐ |
|---|--------|----------|---|
| A3.1 | Sidebar | Sem Financeiro / Apontamentos / Inventário / Projetos (default) | ☐ |
| A3.2 | Chamados | **Meus chamados** | ☐ |
| A3.3 | Novo chamado | Cria e aparece na própria lista | ☐ |
| A3.4 | Gestor (outra sessão) | Vê o chamado do funcionário na lista da empresa | ☐ |
| A3.5 | Dashboard visão interna | Reflete ticket criado pelo funcionário | ☐ |

## A4. Staff Alle (não regressão)

Login **ADMIN** / **COLLAB**.

| # | Passo | Esperado | ☐ |
|---|--------|----------|---|
| A4.1 | Sidebar | Sem switcher de empresa cliente | ☐ |
| A4.2 | Dashboard | Seletor empresa Alle; sem toggle cliente | ☐ |
| A4.3 | Apontamentos | Lista colaboradores Alle | ☐ |
| A4.4 | Tickets | Criar + apontar como antes | ☐ |

---

# B) Especialidade + contrato + relatório cobrança

> Só valide se migration `specialty_domain` rodou e labels “Especialidade” já aparecem.

## B1. Cadastro de especialidades e classificação (2 níveis)

| # | Passo | Esperado | ☐ |
|---|--------|----------|---|
| B1.1 | Admin → Classificação / Especialidades | Lista especialidades (ex-mesas: NOC, Infra…) | ☐ |
| B1.2 | Criar/editar especialidade | Nome salva | ☐ |
| B1.3 | Árvore sob especialidade | **Só 2 níveis** (não cria 3º) | ☐ |
| B1.4 | Labels | “Especialidade”, não “Mesa de serviço” | ☐ |

## B2. Usuário Alle — 1 especialidade

| # | Passo | Esperado | ☐ |
|---|--------|----------|---|
| B2.1 | Admin → Usuários → editar collab | Campo **Especialidade** (uma) | ☐ |
| B2.2 | Salvar especialidade NOC | Persiste | ☐ |
| B2.3 | Outro usuário → Infra | Persiste | ☐ |

## B3. Contrato com N especialidades

| # | Passo | Esperado | ☐ |
|---|--------|----------|---|
| B3.1 | Empresa → Contratos → novo/editar | Vínculo a **1+ especialidades** | ☐ |
| B3.2 | Por linha: horas, valor contrato, valor hora excedente, flag ilimitado | Campos salvam | ☐ |
| B3.3 | Valor hora “cheio” | Calculado = valor contrato ÷ horas (se horas > 0 e não ilimitado) | ☐ |
| B3.4 | Ilimitado = sim | Sem teto; cobrança só valor contrato | ☐ |

## B4. Ticket “forma nova”

Login quem **cria ticket** (Alle ou cliente com pack).

| # | Passo | Esperado | ☐ |
|---|--------|----------|---|
| B4.1 | Novo chamado | Campo **Especialidade** (obrigatório) | ☐ |
| B4.2 | Classificação | Cascade **2 níveis** sob a especialidade | ☐ |
| B4.3 | Abrir ticket em especialidade ≠ a do usuário | Permitido | ☐ |
| B4.4 | Apontar horas no ticket (usuário NOC) | Apontamento OK | ☐ |
| B4.5 | Outro usuário Infra aponta no mesmo ticket (se fluxo permitir) | OK | ☐ |

## B5. Relatório estatística (cliente / geral)

| # | Passo | Esperado | ☐ |
|---|--------|----------|---|
| B5.1 | Relatórios → Estatística / Dashboard por especialidade do **ticket** | Ex.: Infra 30h mesmo se apontador for NOC | ☐ |

## B6. Relatório de cobrança (pagamento)

| # | Passo | Esperado | ☐ |
|---|--------|----------|---|
| B6.1 | Abrir relatório cobrança (gerador ou rota dedicada) | Tela carrega | ☐ |
| B6.2 | Filtro **multi-empresa** | Seleciona 2+ empresas | ☐ |
| B6.3 | Filtro **especialidade(s)** | Filtra linhas | ☐ |
| B6.4 | Filtro visão **tudo** | Todas as linhas cliente×especialidade | ☐ |
| B6.5 | Filtro **só excedente** | Só onde C > B (E negativo) | ☐ |
| B6.6 | Conferir colunas | B contratado, C gasto (por **especialidade do apontador**), D=B−C, E=D×hora excedente, F=C×hora calc., ilimitado, valor contrato, **a cobrar** | ☐ |
| B6.7 | Caso sem estouro | E ≥ 0; a cobrar = valor contrato | ☐ |
| B6.8 | Caso estouro | E &lt; 0; a cobrar = valor contrato + \|E\| | ☐ |
| B6.9 | Caso ilimitado | D/E zerados; a cobrar = valor contrato | ☐ |

### Mini-cenário numérico (B6)
1. Contrato empresa A · especialidade Infra: 10h, valor contrato R$ 1000, hora excedente R$ 150  
2. Usuário especialidade Infra aponta 12h em tickets da empresa A  
3. Esperado: B=10, C=12, D=−2, E=−300, a cobrar = 1000+300 = **1300**  
4. Mesmas 12h apontadas por usuário **NOC** (contrato NOC separado) → conta no pacote **NOC**, não Infra  

---

# C) Checklist rápido “caminho feliz” (30 min)

1. Admin: pack + gestor + funcionário  
2. Gestor: menu, novo ticket empresa, apontamentos = funcionários, dashboard dual  
3. Funcionário: meu ticket + gestor vê  
4. Staff: sem regressão  
5. (Se especialidade pronta) user 1 especialidade → apontar → relatório cobrança com filtros  

---

## Bugs / anotar

| ID | Onde | O que aconteceu | Gravidade |
|----|------|----------------|-----------|
| | | | |

Regras de cobrança: [`ESPECIALIDADE_COBRANCA.md`](./ESPECIALIDADE_COBRANCA.md)  
Deploy teste v3: [`DEPLOY_PORTAL_CLIENTE_V3_TESTE.md`](./DEPLOY_PORTAL_CLIENTE_V3_TESTE.md)
