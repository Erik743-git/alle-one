# Licenciamento de usuário cliente

Combinado com o Erik em 01/10/2026.

- Vale só para **usuário de cliente** (gestor ou membro).
- Em Admin → Usuários, cliente marcado como **Responsável** ganha a caixa
  **"Usuário licenciado"** (desabilitada enquanto não for responsável; sem
  responsável a licença é gravada como falsa).
- **Licenciado:** nada muda, aponta como hoje.
- **Sem licença:** no máximo **2 apontamentos de horas por chamado**, contando
  só os dele naquele chamado. **Comunicação não conta** (apontamento de 0
  minuto). O 3º é recusado pelo servidor e a tela mostra o aviso:
  "Para continuar apontando, comunique o financeiro ou um administrador para
  adquirir o licenciamento." Não há como ignorar o aviso.
- Equipe interna (admin, colaborador, terceiro) não tem limite.
- **Selo "Licenciado Alle"** (símbolo da Alle) no menu do usuário licenciado;
  "• Licenciado" na lista de usuários do admin.

Técnico: coluna `users.licensed` (migração `20261001100000_usuario_licenciado`),
regras em `backend/src/modules/licenca/licenca-regras.ts`, checagem em
`TicketsAppointmentsService.createAppointment` (erro `LICENCA_NECESSARIA`).

**Atenção no deploy:** todo cliente começa **sem licença**. Quem hoje aponta
mais de 2 vezes por chamado passa a ser bloqueado até o admin marcar a licença.
