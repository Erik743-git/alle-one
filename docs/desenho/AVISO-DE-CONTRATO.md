# Aviso de consumo de contrato

Combinado com o Erik em 25/09 (item E). **Construído em 24/09 (sandbox).**

- **Quando:** rotina de hora em hora (minuto 20). Para cada empresa ativa
  com contrato ativo e não vencido, compara as horas usadas no mês
  (Brasília; mesma conta do painel/Financeiro) com as horas contratadas
  (mesma conta do Financeiro: soma das linhas por mesa, linha ilimitada
  fica de fora; contrato sem horas não gera aviso).
- **Faixas:** 80% e 100%. Cada faixa avisa **uma vez por empresa e mês**. Se
  o consumo pula direto para 100%, sai só o aviso de 100%.
- **Quem recebe:** e-mail e Correio para os **admins** e para a **mesa
  Comercial**. O gestor do cliente **não** recebe. No Correio, o admin cai
  no Financeiro da empresa; o comercial, em Oportunidades.
- **Em 100%:** abre sozinho uma oportunidade **"Renovação/ampliação de
  contrato — <empresa>"** em Pendente, tipo Contrato, com o cliente já
  preenchido, e avisa o comercial como card novo. Se já houver uma
  renovação aberta para a empresa (não fechada nem reprovada), não abre
  outra.
- **Convivência:** o alerta antigo do Correio (faixa 30%–70%, recalculado ao
  abrir o Correio) continua como está.
