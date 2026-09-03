# Contrato dos relatórios de horas (Rendimento / HE / Plantão)

_Fonte de verdade para o cálculo de horas trabalhadas, hora extra, plantão e saldo._
_Escrito em 2026-09-03 a partir de auditoria das divergências entre a tela de Rendimento e o relatório em Excel/CSV. Enquanto os itens de "Implementação" não estiverem todos ✅, a tela e o relatório podem divergir._
_Decisões de negócio confirmadas com o RH/produto em 2026-09-03 (ver §14). Cutover TiFlux (fim do espelho `tiflux.*`): 15/09/2026._

---

## 1. Por que este documento existe

Hoje o mesmo número (horas de um técnico num período) é calculado em pelo menos 4 lugares com regras diferentes:

- Tela de Rendimento (`rendimento.service.ts`)
- Aba "Relatório" do XLSX (`reports.service.ts` → `getHoursUsageXlsxDetailRows`)
- Linhas do CSV (`reports.service.ts` → `getHoursUsageRows`)
- Aba/seção "Resumo por Atendente" (`reports.service.ts` → `getRendimentoAttendantSummaries`)

Cada um reimplementa um pedaço (janela, arredondamento, sobreposição, filtro de usuário). O objetivo é ter **uma implementação só**, que todos importam.

---

## 2. Glossário

| Termo | Definição |
|---|---|
| **Apontamento** | 1 registro de tempo num ticket: data, hora início, hora fim, tipo de serviço. |
| **Tipo de serviço** (`service_name`) | Texto vindo do TiFlux: `HORA NORMAL`, `HORA EXTRA`, `PLANTÃO`, `Default`, `Cortesia`. Define a categoria. |
| **Categoria** | `NORMAL`, `EXTRA` ou `PLANTAO`, derivada do tipo de serviço por `overtimeKindFromValorization`. |
| **Ciclo de folha** | Período 26 do mês anterior → 25 do mês atual. Fechamento de folha. |
| **Mês civil** | 1º ao último dia do mês (ou o intervalo exato escolhido na tela). |
| **União (não sobreposto)** | Soma do tempo de relógio, contando trecho sobreposto **uma vez**. |
| **Bruto** | Soma da duração de cada apontamento, sem deduplicar. |
| **Saldo de HE** | Banco de horas extras do técnico. Acumulativo, não expira. Ver §8. |

---

## 3. Regra 1 — Janela de datas

| Superfície | Janela |
|---|---|
| Tela de Rendimento — **Horas totais do mês** | **Mês civil vigente** (1º ao último dia). Conta todas as horas do mês. |
| Tela de Rendimento — **Hora extra / Plantão / Saldo** | **Ciclo de folha 26→25** que contém a data de referência. Rótulo visível na UI (ex.: "26/07 a 25/08"). |
| Relatório (XLSX/CSV) | **Seletor** na tela do gerador: `Ciclo de folha (26→25)` **(padrão)** ou `Mês civil`. No modo "Mês civil" usa exatamente as datas escolhidas. |

> As duas janelas na mesma tela são **de propósito** (folha ≠ mês civil). A tarefa é rotular cada bloco com clareza, não unificar.

- Bounds **inclusivos nas duas pontas**: `appointment_date BETWEEN inicio::date AND fim::date`.
- Comparação sempre em **data** (`::date`), sem timezone/hora.
- Helper único: `resolvePayrollPeriodRange` / `resolvePayrollPeriodRangeForCalendarMonth` (já existem em `rendimento-payroll-period.helper.ts`).

---

## 4. Regra 2 — Cálculo de minutos de um apontamento

**Decisão: ignorar segundos. Trabalhar só em horas e minutos (HH:MM), valores exatos.**

Função canônica única (em JS/TS), usada por tela **e** relatório:

```
minutos(init, end):
  i = h(init)*60 + m(init)          # segundos descartados
  e = h(end)*60  + m(end)
  se end vazio ou e <= i:           # vira-meia-noite ou fim ausente
    e = e + 24*60  (quando há init e end e e<=i)
    se ainda inválido -> 0
  retorna max(0, e - i)
```

- Elimina as 3 variantes atuais (`getAppointmentMinutes` com `Math.floor`+segundos; SQL `extract(epoch)::int` que arredonda; `parseClockToMinutes` que já ignora segundos).
- As queries passam a trazer só `init_time` / `end_time` crus; o cálculo é no app.
- Corrige de quebra: apontamento de duração 0 (ex.: `21:26–21:26`) **conta 0**, não 1 min.

---

## 5. Regra 3 — Sobreposição e prioridade entre categorias

### 5.1 Dentro da mesma categoria
Sempre **união** (tempo de relógio uma vez só). Vale para NORMAL, EXTRA e PLANTAO.
Motivo: a pessoa não trabalha 2h em 1h. Dois apontamentos sobrepostos = mesmo tempo.

### 5.2 Prioridade entre categorias: **PLANTAO > EXTRA > NORMAL**
Quando o mesmo trecho de relógio está coberto por apontamentos de categorias diferentes, ele conta na categoria de **maior prioridade** e sai das outras.

```
intervalosPlantao = uniãoPorDia(rows categoria=PLANTAO)
intervalosExtra   = uniãoPorDia(rows categoria=EXTRA)   menos  intervalosPlantao
intervalosNormal  = uniãoPorDia(rows categoria=NORMAL)  menos  (intervalosPlantao ∪ intervalosExtra)

minutosPlantao = soma(intervalosPlantao)
minutosExtra   = soma(intervalosExtra)
minutosNormal  = soma(intervalosNormal)
minutosTotal   = minutosNormal + minutosExtra + minutosPlantao      # trechos disjuntos
```

- PLANTAO×PLANTAO e EXTRA×EXTRA deduplicam dentro da própria categoria (união).
- HE que cruza plantão → o trecho cruzado é **plantão** (plantão ganha).
- "Bruto" (soma sem deduplicar) continua disponível como métrica separada ("Horas apontadas"), **nunca** como base de HE/plantão/pagamento.
- **Exibição na tela: sem mudança.** Os toggles "sem HE (do mês)" e "sem sobreposição" que já existem continuam iguais. A prioridade acima só decide em qual categoria o trecho cruzado é rotulado.

### 5.3 Impacto conhecido (dados de produção)
- **Plantão da tela hoje usa bruto** → passa a usar união. Ex. real: _Eduardo Gabriel dos Santos_, ciclo 26/07–25/08: bruto 18:50 → união **17:00** (1h50 sobrepostas).
- HE da tela já usa união (correto). Ex. real: _Breno Wonczewski_, ciclo 26/08–25/09: união **13:29** vs bruto 13:51.

---

## 6. Regra 4 — Classificação NORMAL / EXTRA / PLANTAO

- Fonte: tipo de serviço do apontamento (`service_name` no schema canônico `portal_ticket_appointments`; `valorization_raw` no espelho `tiflux.*`).
- Função única: `overtimeKindFromValorization` (`rendimento-day-insights.ts`). Regras:
  - contém `PLANTAO`/`PLANTÃO` → `PLANTAO`
  - contém `HORA EXTRA`/`HORAS EXTRA` → `EXTRA`
  - resto (`HORA NORMAL`, `Default`, `Cortesia`, vazio) → `NORMAL`
- **Verificado em produção (2 ciclos):** `HORA NORMAL` 5781, `HORA EXTRA` 184, `PLANTÃO` 74, `Default` 50, `Cortesia` 1. `service_name` **está populado**; classificação funciona.
- Ação: relatório operacional listando apontamentos com `service_name` = `Default`/`Cortesia`/vazio para revisão manual (não bloqueia cálculo, contam como NORMAL).

---

## 7. Regra 5 — Atribuição de usuário (apontamento órfão)

- Todo apontamento é atribuído a **um** usuário do portal.
- **Lado ETL (TiFlux → portal):** quando o e-mail do técnico no TiFlux não casa com nenhum `users.email`, o apontamento vai para o usuário dedicado **"Não mapeado"** (`apontamentos.nao-mapeados@alletecnologia.internal`, inativo, sem senha). Já implementado no commit `24b52c4`. Se houver nome de técnico vindo do TiFlux, guardar como dica para exibição: `Não mapeado (TiFlux: "Fulano")`.
- **Nunca** dropar silenciosamente. **Nunca** cair em um ADMIN real.
- **Lado relatório/tela:** `portal_ticket_appointments.created_by` é FK obrigatória para `users` (`onDelete: Restrict`) — **órfão é estruturalmente impossível** no schema canônico. O que resta é alinhar as 3 queries do relatório para **não divergirem**: `getHoursUsageRows` não filtra `u.name`; as queries de detalhe e de resumo têm `WHERE u.name IS NOT NULL AND trim(u.name) <> ''` (dropa). Trocar as três por `COALESCE(NULLIF(TRIM(u.name), ''), 'Não mapeado')` e **nenhuma** dropar linha.
- Consequência: soma da coluna "Duração" da aba detalhe passa a fechar com "Horas apontadas" do resumo; CSV e XLSX passam a bater. **Impacto em número hoje: zero** (0 órfãos em produção, todo `created_by` resolve).

---

## 8. Regra 6 — Saldo de hora extra (banco de horas)

### 8.1 Conceito
- O **saldo** é a HE do técnico **ainda disponível** para uso (pagamento ou abono de falta).
- HE lançada e classificada entra no saldo.
- Ao ser **aprovada** (RH), a HE **é paga** e **sai do saldo** — não está mais disponível para outro uso.
- O check **"debitar de HE"** numa justificativa de falta significa: o técnico assume que **não tem documento** para abonar a falta e pede para descontar do saldo.
  - Justificativa **pendente** → saldo **segurado**, mostrado como pendente, ainda não descontado.
  - Justificativa **aprovada** → **desconta** do saldo.
  - Justificativa **negada** → **não desconta**, saldo permanece.
- Saldo **pode ficar negativo** (o técnico pode excluir uma justificativa ainda não aprovada se viu que ficou negativo).

### 8.2 Fórmula (por ciclo de folha 26→25)
```
he_lancada(ciclo)   = minutosExtra do ciclo (Regra 3: união + prioridade PLANTAO>EXTRA>NORMAL)
he_aprovada(ciclo)  = Σ rendimento_day_events (event_type=OVERTIME, status=APPROVED) no ciclo
he_debitada(ciclo)  = Σ rendimento_gap_justifications (status=APPROVED, debit_overtime=true) no ciclo

saldo(ciclo) = he_lancada(ciclo) - he_aprovada(ciclo) - he_debitada(ciclo)
```
- `decideDayEvent` seta `debit_protected = (decision === 'APPROVED')`. Confirmado com o RH: **não existe** aprovar HE sem que ela saia do saldo. Logo a query de saldo pode usar só `status='APPROVED'`; `debit_protected` fica redundante.

### 8.3 Rollover / acúmulo entre ciclos — **FORA DE ESCOPO por enquanto**
- O saldo **continua zerando a cada ciclo** (comportamento atual de `refreshBalance`: sobrescreve, não acumula).
- Levar o que sobrou de um ciclo para o seguinte ("HE não expira") é **mudança futura**, quando o RH decidir. Só então entra a tabela-ledger (`rendimento_overtime_ledger`), fechamento no dia 26 e migração de saldo inicial.

### 8.4 Arredondamento
Todos os termos do saldo em minutos inteiros (Regra 2). Remover os `Math.trunc` espalhados quando o helper único entrar.

---

## 9. Regra 7 — Chave de dedup de alertas

- Hoje: `abs(hashtext(a.id))::int` como id sintético quando não há id TiFlux → risco de colisão / overflow.
- Passa a usar `a.id` (texto/uuid) direto como chave nos maps de dedup de alertas (`countRendimentoAlertsInPeriod`, `analyzeRendimentoDay`).

---

## 10. Onde cada regra se aplica

| Regra | Tela Rendimento | XLSX detalhe | XLSX/CSV resumo | CSV linhas |
|---|:-:|:-:|:-:|:-:|
| 1 Janela | total = mês civil; HE/plantão = folha 26→25 | ✔ seletor folha/civil | ✔ seletor | ✔ seletor |
| 2 Minutos sem segundos, sem lixo | ✔ | ✔ | ✔ | ✔ |
| 3 União + prioridade PLANTAO>EXTRA>NORMAL | ✔ | linha = apontamento; **totais** e resumo = Regra 3 | ✔ | ✔ |
| 4 Classificação única | ✔ | ✔ | ✔ | ✔ |
| 5 Alinhar predicado de usuário nas 3 queries | ✔ | ✔ | ✔ | ✔ |
| 7 Chave dedup por `id` | ✔ | ✔ | ✔ | — |

Nota: a coluna "Hora extra" da **aba detalhe** continua sendo a duração da própria linha (visão apontamento-a-apontamento). Os **totais** e o **resumo** usam a Regra 3. Incluir nota de rodapé na planilha explicando a diferença.

---

## 11. Plano de implementação

### Fase 1 — sem impacto em número
1. ✅ **#5** (`1aa5504`) — 3 queries do relatório usam `COALESCE(NULLIF(TRIM(u.name),''),'Não mapeado')`; nenhuma dropa linha. FK obrigatória → 0 órfãos → 0 mudança de número.
2. ✅ **#2** (`d9a84c4`) — função única `appointmentDurationMinutes` (= `hhmmDurationMinutes`): HH:MM sem segundos, valida 0–23/0–59 (fora → 0), cruza meia-noite. `parseClockToMinutes` valida faixa; `appointmentToInterval` e `computeRawAppointmentMinutes` derivam duração dos horários; `reports.getAppointmentMinutes` delega. **Verificado contra produção (4 ciclos): 0 mudança** de número. Falta trocar o `extract(epoch)::int` que sobra nas queries SQL — item #2b, adiado (os helpers JS já saneiam).
3. ⏸️ **#7** — adiado. `appointment_id` numérico casa apontamento↔evento de aprovação e alimenta `analyzeRendimentoDay` (compartilhado tela+relatório). Trocar para texto exige mudar a assinatura dessa função. Impacto real quase nulo.
4. ~~#4 relatório de `service_name` ambíguo~~ — descartado (TiFlux sai em 15/09).

### Fase 2 — muda tela/relatório (baixo impacto, precisa revisar casos)
4. **#3** — `computeCategorizedMinutes(rows)` no helper, retornando `{ normal, extra, plantao, total, bruto }` com a prioridade PLANTAO>EXTRA>NORMAL. Tela e relatório passam a chamar. Plantão deixa de ser bruto na tela — **só daqui pra frente** (ciclos já pagos não são recalculados).
5. **#1** — seletor "Ciclo de folha (26→25)" (padrão) / "Mês civil" no gerador de relatórios; rótulos claros na tela separando "total do mês" de "HE do ciclo".

### Futuro (quando o RH decidir)
6. **#6 rollover** — ledger de HE que não expira, fechamento no dia 26, migração de saldo inicial.

Cada item entra por PR na branch `feat/cutover-tiflux-hardening-20260727`, com teste unitário no helper e verificação contra dados reais de produção antes do deploy (staging → produção).

---

## 12. Decisões confirmadas (2026-09-03)

| Tema | Decisão |
|---|---|
| Prioridade de categoria | PLANTAO > EXTRA > NORMAL. HE×HE e Plantão×Plantão deduplicam dentro da própria categoria. |
| Exibição na tela | **Sem mudança.** Toggles "sem HE (do mês)" e "sem sobreposição" continuam iguais. Total = mês civil; HE/plantão = folha 26→25 (rótulos claros). |
| Check "debitar de HE" | Técnico sem documento para abonar falta → desconta do saldo. Pendente = segura; aprovada = desconta; negada = não desconta. |
| HE aprovada | É paga → sai do saldo (não fica mais disponível). Não existe aprovar sem descontar → `debit_protected` redundante. |
| Fechamento de ciclo | Todo dia 26. |
| Rollover de saldo | **Fora de escopo agora.** Saldo segue zerando por ciclo. Mudança futura. |
| `Default` / `Cortesia` | Contam como NORMAL. Sem tratamento especial — some com o cutover TiFlux (15/09/2026). |
| Apontamento quebrado (duração negativa, 0 min) | Portal já valida (`parseHhMmToMinutes`, hora 0–23 / min 0–59). Registros ruins são legado TiFlux. O item #2 zera esses no relatório. Sem limpeza dedicada agora. |
| Plantão bruto→união | Regra muda **daqui pra frente**. Ciclos já pagos (ex.: Marcos Joos, jun) **não** são recalculados. |
| Órfão no relatório | FK obrigatória torna órfão impossível no schema canônico. Alinhar as 3 queries para não divergir. Impacto hoje: zero. |

---

## 13. Evidências da auditoria (produção, 2026-09-03)

- **Divergência de filtro de usuário:** `getHoursUsageRows` não filtra `u.name`, as outras 2 queries do relatório filtram → CSV e XLSX do mesmo relatório divergem se houver `users.name` vazio.
- **Plantão bruto × união:** _Eduardo Gabriel dos Santos_ (ciclo 26/07–25/08): 18:50 → 17:00. _Marcos Joos_ (ciclo 26/05–25/06): **51:40 → 31:59** (−19:41), plantões dos dias 20 e 21/06.
- **HE união (correta):** _Breno Wonczewski_ (ciclo 26/08–25/09): 13:29 união / 13:51 bruto; diferença são 5 apontamentos curtos dentro de um bloco 12:00–23:59 marcado HORA EXTRA.
- **`service_name` populado:** só 51 de ~6090 apontamentos sem tipo claro (`Default`/`Cortesia`).
- **Arredondar < 5 min → 5 min:** impacto < 0,2% em todas as 20 maiores empresas. "Ganhos" maiores eram registros quebrados (1 linha de −22h na ALLE CONSULT; 43 linhas de 0 min na Fluidra).
- **Saldo sem rollover:** `refreshBalance` sobrescreve o valor; nenhum acúmulo entre ciclos.
