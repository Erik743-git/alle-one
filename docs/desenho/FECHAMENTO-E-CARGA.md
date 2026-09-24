# Fechamento do mês e Carga da equipe

Combinado com o Erik em 25/09 (itens C e D). **Construído em 24/09
(sandbox).** As duas partes ficam em **Apontamentos**, em abas.

## C. Fechamento (aba "Fechamento", só admin)

- **Ciclo 26 → 25** (o mesmo da folha). A lista mostra os últimos 12 ciclos;
  abre no último que já terminou.
- **Conferência** antes de fechar (só apontamentos lançados pelo portal, da
  equipe interna; comunicação não conta):
  - **Sobreposição:** mesma pessoa com dois apontamentos no mesmo horário,
    no mesmo chamado ou em chamados diferentes;
  - **Dia com mais de 12 h** (soma sem contar duas vezes a sobreposição);
  - **Fim de semana sem plantão:** sábado ou domingo lançado com serviço que
    não é Plantão;
  - **Lançado depois do dia:** registrado num dia posterior ao trabalhado
    (fuso de Brasília).
  Cada item leva ao chamado e à agenda da pessoa.
- **Fechar ciclo:** só depois do dia 25. Com o ciclo fechado, **ninguém**
  (admin inclusive) cria, edita, move ou apaga apontamento com data dentro
  dele. A mensagem diz o período e que o admin precisa reabrir.
- **Reabrir:** só admin, com motivo (mínimo 10 caracteres). Fechar e reabrir
  ficam no histórico do ciclo e na Auditoria.
- **Limites:** apontamento feito direto no TiFlux não passa pelo portal e
  não é travado. A trava não mexe em justificativas nem em aprovação de
  horas extras (a decidir se deve).

## D. Carga da equipe (aba "Carga da equipe")

- **Quem vê:** admin sempre. Colaborador só se o admin liberar a linha
  **"Apontamentos — Carga da equipe"** em Acesso por perfil (começa
  desligada). O colaborador liberado entra pelo botão "Carga da equipe" na
  própria agenda (`/apontamentos/carga`).
- **Totais:** chamados abertos, parados (sem movimento há mais de 48 h, o
  mesmo critério do Correio) e sem responsável.
- **Por mesa:** pessoas (pela mesa do técnico), abertos, parados e sem
  responsável (pela mesa do chamado), horas da semana contra o esperado.
- **Por técnico** (colaboradores e terceiros ativos): abertos, parados (com
  a lista dos parados), horas da semana (segunda a hoje) contra a jornada
  de cada um (padrão ou personalizada em Usuários) e o percentual.
- O responsável do chamado é ligado ao usuário pelo **nome**, como no
  Correio: nome diferente no TiFlux e no portal não conta para a pessoa.
