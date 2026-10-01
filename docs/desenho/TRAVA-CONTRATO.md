# Trava de apontamento por contrato

Combinado com o Erik em 01/10/2026.

- Caixa **"Travar apontamentos ao esgotar as horas"** no cadastro do contrato
  (Empresas → Contratos). Vale para **cada especialidade** do contrato, cada
  uma pelo próprio limite (ex.: Infostore → DBA SQL 80h trava ao chegar a 80h;
  as outras linhas seguem até o limite delas). Linha ilimitada não trava.
- **Horas por mês** (o contador zera no dia 1, fuso de Brasília). Conta o mês
  da **data do apontamento**.
- Mesma conta do aviso de contrato e do Financeiro: todas as horas da mesa da
  especialidade no mês, **inclusive hora extra e plantão**.
- **O lançamento que estoura passa** (79h + 2h = 81h); a partir daí os
  próximos são recusados.
- **Admin continua apontando.** Todo o resto (colaborador, terceiro, cliente)
  recebe: "As horas do contrato "X" (Especialidade) deste mês acabaram (Nh de
  Nh). Entre em contato com o seu gestor."
- **Comunicação** (apontamento de 0 minuto) não é bloqueada.

Técnico: coluna `contracts.lock_on_exhausted` (migração
`20261001120000_contrato_trava`), `backend/src/modules/contrato-trava/`
(regras + serviço com cache de 60 s por empresa/mês), checagem em
`TicketsAppointmentsService.createAppointment` (erro `CONTRATO_ESGOTADO`).
Chamado sem especialidade ou de empresa sem contrato com trava não é afetado.

Fora do escopo por enquanto: editar um apontamento para aumentar as horas não
passa pela trava (só criar).
