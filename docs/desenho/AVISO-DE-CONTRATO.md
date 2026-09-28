# Aviso de consumo de contrato

Combinado com o Erik em 25/09 (item E). **Construído em 24/09 (sandbox).**
**Mudou em 28/09:** a conta passou a ser **por linha** de contrato, com as
faixas 50/80/100 e o aviso do dia 15 (ver
`docs/desenho/APONTAMENTOS-TELAS-ADMIN.md`, parte 5). O texto abaixo é a
regra atual; a de 24/09 está no fim, para referência.

- **Linha:** cada linha do contrato por especialidade (`ContractSpecialty`:
  contrato + especialidade + horas mensais). Linha ilimitada ou sem horas
  fica de fora. Só contrato ativo e não vencido, de empresa ativa.
- **Horas da linha:** as apontadas no mês (Brasília) em chamados da empresa
  na mesa com o nome da especialidade — a mesma soma por mesa do painel do
  Financeiro (`horasPorMesa`), contra as horas daquela linha.
- **Quando:** rotina de hora em hora (minuto 20).
  - **Qualquer dia:** ao passar de **50%**, **80%** e **100%**, cada faixa
    **uma vez por linha e mês**. Se o consumo pula várias faixas de uma vez,
    sai só o aviso da mais alta.
  - **Dia 15, a partir das 8h de Brasília:** linha em **50% ou menos**, uma
    vez no mês. "A partir das 8h" para que, se a rotina das 8h não rodar, a
    das 9h cubra.
- **O que diz:** cliente, título do contrato, especialidade e horas usadas /
  contratadas (com o percentual).
- **Quem recebe:** e-mail e Correio para os **admins** e para a **mesa
  Comercial**. O cliente **não** recebe. No Correio, o admin cai no
  Financeiro da empresa; o comercial, em Oportunidades.
- **Em 100%:** abre sozinho uma oportunidade **"Renovação/ampliação de
  contrato — <empresa>"** em Pendente, tipo Contrato, com o cliente já
  preenchido. Uma por empresa: se já houver uma renovação aberta (não
  fechada nem reprovada), de outra linha ou de outro mês, não abre outra.
- **Controle de "já avisado":** tabela `contrato_aviso_linhas` (linha, mês,
  faixa; faixa 0 = aviso do dia 15). A tabela antiga `contrato_avisos`, por
  empresa, ficou intacta como histórico.
- **Alerta antigo do Correio (30%–70%):** **removido** em 28/09. O tipo
  continua na limpeza do Correio, para os avisos antigos sumirem.
- **Não mexido:** as "regras de alerta de uso" por empresa
  (`usage-alerts`), configuráveis e com destinatário próprio, são outra
  funcionalidade e seguem como estavam.

## Regra de 24/09 (substituída)

Por empresa (soma das linhas), faixas 80% e 100%, uma vez por empresa e mês;
mesmos destinatários e mesma oportunidade em 100%. O alerta antigo do Correio
(30%–70%) convivia com ela.
