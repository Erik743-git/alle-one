# Roteiro de teste — feedback Matheus (criação de chamado + pré-ticket)

Ambiente: local (`frontend` :3000 · `backend` API). Login com usuário que **cria chamado** (ADMIN/COLLAB com permissão).

## Antes

1. Migrations aplicadas (`prisma migrate deploy`).
2. Empresa de teste com `tifluxClientId` + pelo menos **1 GMUD** cadastrada (para o select).
3. SMTP configurado se for validar e-mail real; senão conferir só log do backend (“SMTP não configurado” / “E-mail enviado”).

---

## A) Novo chamado — `/tickets/new`

| # | O que testar | Esperado |
|---|--------------|----------|
| 1 | Escolher **Cliente** | Título ganha prefixo `NOME - ` (ex. `TUPER - `). Trocar cliente troca o prefixo e mantém o resto do texto. |
| 2 | Abrir sem solicitante / sem e-mail | Botão desabilitado ou erro; campos com `*`. |
| 3 | Telefone | Máscara `(XX) XXXXX-XXXX`; inválido bloqueia; vazio ok. |
| 4 | Descrição: texto + Ctrl+V print | Print aparece; **arrastar canto** muda tamanho; após criar, no detalhe o tamanho se mantém. |
| 5 | Fundo da descrição | No detalhe, HTML/e-mail **não** fica bloco branco estranho. |
| 6 | **GMUD do cliente** | Lista GMUDs da empresa do cliente; sem cliente → mensagem; escolher grava referência no chamado. |
| 7 | **Pessoas em cópia** | Adicionar 1–2 e-mails; chips; remover um. |
| 8 | Abrir chamado | Toast **“Ticket criado com sucesso.”** (sem falar TiFlux). Abre o detalhe. |
| 9 | E-mail registro | Solicitante (e CC) recebem / ou log SMTP no backend. |

## B) Pré-ticket — `/tickets/pre-tickets`

| # | O que testar | Esperado |
|---|--------------|----------|
| 10 | Abrir um pré-ticket PENDING | Gera número; status OPENED. |
| 11 | E-mail ao solicitante | Remetente do pré-ticket recebe template “chamado registrado” (ou log SMTP). |

## C) Admin e-mail — `/admin/email` → aba **Envio**

| # | O que testar | Esperado |
|---|--------------|----------|
| 12 | Listar templates | `TICKET_REGISTERED` e `GMUD_NOTIFY`. |
| 13 | Editar assunto/corpo e salvar | Persiste; próximo create/open usa o texto novo (variáveis `{{ticketNumber}}` etc.). |

## D) Regressão rápida

| # | O que testar | Esperado |
|---|--------------|----------|
| 14 | Lista/detalhe ticket | Descrição e prints ok. |
| 15 | Cliente (role CLIENT) | Continua só visualizando; não cria. |

---

## Checklist rápido (copiar)

- [ ] Prefixo no título
- [ ] Solicitante + e-mail obrigatórios
- [ ] Telefone máscara
- [ ] Print com resize persistido
- [ ] Sem fundo branco estranho
- [ ] Select GMUD
- [ ] CC no create
- [ ] Toast sem TiFlux
- [ ] E-mail no create
- [ ] E-mail no open pré-ticket
- [ ] Templates na Admin → Envio
