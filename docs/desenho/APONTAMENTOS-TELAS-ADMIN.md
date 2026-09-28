# Apontamentos: telas de admin, notificação no Correio e aviso de contrato por linha

Combinado com o Erik em 25/09/2026, numa sessão só de escopo (nenhum código
escrito nela). Registrado em 28/09 para a sessão que vai implementar.

Como ler:

- Trechos **entre aspas** são as palavras do Erik, só com erros de
  digitação corrigidos (ex.: "resposavel" → "responsavel", "daus" → "duas").
- **Escopo final** é o resumo que fechei no fim da conversa e que o Erik
  aprovou: ele respondeu a única pergunta que sobrou ("continua como esta") e
  depois se referiu a ele como "o escopo que aprovei com você".
- **PENDENTE** é o que não foi decidido. Não implementar por conta própria:
  perguntar ao Erik.

---

## 1. Fechamento e Carga da equipe

Pedido: "fechamento e carga da equipe vao cair fora, pode remover oq tiver
haver com esses sub-modulos, se for quebrar algo ou tiver alguma duvida
pergunte antes".

**Tirar de vez ou só esconder da tela?** Tirar de vez: **apagar o código**
("pode remover oq tiver haver com esses sub-modulos").

**O bloqueio de apontamento em ciclo fechado deixa de existir?** **Sim.**
Pergunta feita: "Pode tirar a trava de ciclo fechado junto com o Fechamento?"
Resposta: "pode".

- Por que isso não quebra nada para quem usa hoje: produção nunca teve a
  trava (o Fechamento só existe na teste). E manter a trava sem a tela
  deixaria ciclo fechado sem ninguém capaz de reabrir.

**Banco (escopo final):**

- As duas migrações que criaram os módulos **ficam**, porque já rodaram na
  teste: `20260926120000_fechamento_ciclo` e
  `20260926130000_acesso_carga_equipe`.
- Uma **migração nova** apaga as tabelas `fechamento_ciclos` e
  `fechamento_eventos` e a linha `carga-equipe` de `acesso_modulos`.
- Regra: migração que já rodou em algum banco nunca é renomeada nem apagada.
  Foi o que quebrou o deploy da teste em 25/09.

**Não mexer** no que só tem o mesmo nome: e-mail de fechamento de chamado,
relatório "Fechamento / cobrança", pesquisa de satisfação no fechamento.

**Onde está hoje** (levantado em 25/09 na branch `teste/integracao-20260923`;
conferir de novo antes de apagar):

- API: `backend/src/modules/fechamento/` (inclui `periodo-fechado.service.ts`),
  `backend/src/modules/carga/`, o registro dos dois em `app.module.ts`, a
  chave `carga-equipe` em `backend/src/modules/acesso/modulos-portal.ts`, os
  modelos `FechamentoCiclo` e `FechamentoEvento` no `schema.prisma`.
- A trava: `PeriodoFechadoService` é injetado em
  `backend/src/modules/tickets/tickets-appointments.service.ts` e chamado
  com `assertAberto(...)` ao **criar, editar e apagar** apontamento.
- Tela: abas "Fechamento" e "Carga da equipe" em
  `frontend/app/apontamentos/page-impl.tsx` (estado `aba`, componentes
  `FechamentoAba` e `CargaEquipe`); rota `/apontamentos/carga`
  (`frontend/app/apontamentos/carga/`); botão "Carga da equipe" em
  `frontend/app/apontamentos/[userId]/page-impl.tsx`; `canAccessCargaEquipe`
  em `frontend/lib/access-control.ts`; `MODULO_CARGA_EQUIPE` em
  `frontend/lib/modulos-desabilitados.ts`; rótulo e rota de
  `/apontamentos/carga` em `frontend/lib/portal-tabs/`; serviços
  `frontend/lib/services/fechamento.service.ts` e `carga.service.ts`;
  componentes `frontend/components/apontamentos/fechamento-aba.tsx` e
  `carga-equipe.tsx`.

---

## 2. Tela 1

Pedido: "Mostrar os tickets com mais de 48 horas sem primeira interação
(novo) e tendo as linhas clicaveis para ir para o ticket na linha preciso do
responsavel, data de criacao do ticket, e duas visoes por empresa e por
responsavel (dois filtros)".

Complemento: "na tela 1 nao somente a 48 horas preciso da visao de tickets
(principalmente) que nunca foram mexidos".

**Nome:** PENDENTE (até aqui só "Tela 1").

**Onde fica:** aba dentro de Apontamentos ("dentro de apontamentos").
Pergunta feita: se as telas novas entravam no lugar das abas Fechamento e
Carga, dentro de Apontamentos, ou em outro lugar do menu.

**Quem vê:** só admin ("so admin (as duas telas novas)").

**O que mostra:**

- **Visão principal: chamados que nunca foram mexidos.** Definição do escopo
  final: ninguém tocou desde a abertura — nenhum apontamento, comunicação,
  troca de estágio ou troca de responsável. Evento automático não conta
  como mexer.
- **Mais de 48 horas:** horas **corridas** ("corridos"). Escopo final: lista
  do mais antigo para o mais novo, com o tempo parado; os de mais de 48h
  ficam destacados e têm filtro próprio.
- **Rotina:** fica fora ("rotina n").
- **Sem responsável:** entra ("sem responsavel sim"). Escopo final: agrupado
  como "Sem responsável". A pergunta citava os pré-tickets como exemplo de
  chamado sem responsável.
- **Colunas:** responsável e data de criação do ticket (pedidas). O escopo
  final acrescenta número, título, cliente e tempo parado.
- **Visões e filtros:** "duas visoes por empresa e por responsavel (dois
  filtros)". Escopo final: agrupado por empresa ou por responsável, com
  filtro de empresa e filtro de responsável.
- **Totais:** PENDENTE.
- **Período padrão (mês civil ou folha 26–25):** PENDENTE. Não foi
  discutido; o combinado é uma lista de chamados parados, sem recorte de
  período.

**Ações:**

- Clicar na linha abre o chamado ("linhas clicaveis para ... ir para o
  ticket").
- Exportar: PENDENTE.

---

## 3. Tela 2

Pedido: "Lista com tickets por analistas e clientes, deve ter duas visoes ou
por empresa ou por colaborador (terceiro tambem), podendo ver todos os
tickets daquele colaborador".

Complemento, respondendo o que ela faz além da lista de chamados agrupada
por Cliente ou Responsável: "a visao de todos os ticketes separadas por
colaborador de forma mais pratica e rapida ver por empresa e responsavel a
quantidade de tickets e quais sao".

**Nome:** PENDENTE (até aqui só "Tela 2").

**Onde fica:** aba dentro de Apontamentos (mesma resposta da Tela 1).

**Quem vê:** só admin.

**O que mostra (escopo final):**

- **Resumo com a quantidade de chamados** por empresa ou por responsável
  (terceiro/PJ incluído).
- **Clicando no nome, a lista de quais são** os chamados.
- Padrão: só os abertos, com opção de incluir os fechados.
- Contexto: a lista de chamados já agrupa por Cliente e por Responsável
  (`frontend/lib/tickets/list-presets.ts`); a Tela 2 é a forma "mais pratica
  e rapida" de ver isso.
- **Colunas da lista de chamados:** PENDENTE.
- **Totais além da quantidade:** PENDENTE.
- **Período padrão (mês civil ou folha 26–25):** PENDENTE.

**Ações:**

- Clicar na linha da lista abre o chamado (escopo final).
- Exportar: PENDENTE.

---

## 4. Notificação no Correio

Pedido: "criar uma notificacao em tela para o solicitante quando abrirem um
ticket novo ou pro responsavel quando alterarem para responsavel (alem do
email que ja deve estar funcionando)".

**O que dispara e para quem:**

- **Solicitante:** quando abrem um chamado novo para ele.
  - Escopo final: só quando **outra pessoa** abre; e só se o e-mail do
    solicitante for de alguém **com login no portal** (e-mail de fora não
    tem Correio).
  - Pergunta feita: "Avisa o solicitante também quando ele mesmo abre o
    chamado? Eu não avisaria. E nas rotinas?" Resposta: "nao, rotina nao
    gera notificacao".
  - Chamado aberto a partir de **pré-ticket de e-mail** notifica o
    solicitante? PENDENTE (não foi discutido).
- **Novo responsável:** quando alguém o coloca como responsável. Escopo
  final: **as mesmas regras do e-mail** que já existe — não avisa quem se
  colocou como responsável, não avisa na automação nem na rotina, não repete
  se o responsável não mudou. Referência: `deveAvisarNovoResponsavel` em
  `backend/src/modules/tickets/ticket-responsavel-aviso.ts` (branch
  `teste/integracao-20260923`, commits `1108480` e `b034e3e`).
- **Rotina nunca notifica** ("rotina nao gera notificacao").

**Texto:** PENDENTE.

**Só no Correio ou também por e-mail?** A notificação nova é **no Correio**
("notificacao em tela"). O e-mail ao novo responsável **já existe** ("alem do
email que ja deve estar funcionando") e não muda. E-mail novo para o
solicitante não foi pedido.

**Técnico (escopo final):** o Correio já existe (`MailboxNotification`,
usado pelo Mural, pelo NPS e pelo aviso de contrato). Entram dois tipos
novos em `MailboxNotificationKind`, com migração.

---

## 5. Aviso de contrato por linha

Pedido: "verificacao de alerta por email referente a contratos, verificar
todo dia 15 quando estiver abaixo ou igual a 50%, e a qualquer dia quando
passar de 50 e 80, esse email deve conter o cliente, o contrato, e a
quantidade de horas".

Complemento sobre "o contrato": "tem que ser separado cada contrato tem
vinculo com uma especialidade especifica assim como ticket".

**O que existe hoje** (ver `docs/desenho/AVISO-DE-CONTRATO.md`): rotina de
hora em hora; conta **por empresa** (soma das linhas do contrato); faixas
**80% e 100%**, uma vez por empresa e mês; e-mail e Correio para os admins e
a mesa Comercial; em 100% abre sozinho a oportunidade "Renovação/ampliação
de contrato".

**O que é a "linha":** cada linha do contrato por especialidade — modelo
`ContractSpecialty` (tabela `contract_specialties`): contrato +
especialidade + horas mensais próprias, ou ilimitada. O contrato tem título
(`Contract.title`).

**O que muda (escopo final):**

- A conta passa a ser **por linha**, e não por empresa: horas apontadas no
  mês em chamados da empresa **com aquela especialidade**, contra as horas
  daquela linha. Linha ilimitada fica fora.
- **Qualquer dia:** avisa ao passar de **50%** e de **80%**, uma vez por mês
  cada.
- **Todo dia 15:** avisa as linhas em **50% ou menos**.
- **No e-mail:** cliente, título do contrato, especialidade e horas (usadas /
  contratadas).
- **Destinatários:** continua como está — admins e mesa Comercial; o cliente
  não recebe ("continua como esta").
- **Oportunidade de renovação:** continua sendo gerada ("pode deixar gerar
  oportunidade").

**Quando o aviso aparece:** em qualquer dia em que a linha passar de 50% ou
de 80%; e no dia 15, para as linhas em 50% ou menos.

---

## 6. PENDENTE

1. **Nomes** da Tela 1 e da Tela 2.
2. **Tela 1:** totais; período padrão (mês civil, folha 26–25, ou nenhum
   recorte); exportar.
3. **Tela 2:** colunas da lista de chamados; totais além da quantidade;
   período padrão; exportar.
4. **Notificação:** o texto das duas; se chamado aberto a partir de
   pré-ticket de e-mail notifica o solicitante.
5. **Aviso de contrato:**
   - se o aviso de **100%** continua. O escopo final propôs manter, porque
     hoje é o 100% que abre a oportunidade, mas o Erik só respondeu "pode
     deixar gerar oportunidade", sem dizer a faixa;
   - em **qual faixa** a oportunidade é aberta (hoje, 100%);
   - se o **Correio** continua junto com o e-mail (hoje vai nos dois; o
     pedido fala só em e-mail);
   - se o **alerta antigo do Correio, faixa 30%–70%**, que o
     `AVISO-DE-CONTRATO.md` diz que "continua como está", segue existindo;
   - o **horário** do aviso do dia 15.
