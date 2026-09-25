# Oportunidades — desenho para aprovação

Módulo novo: controle de oportunidades comerciais em quadro de cards (estilo
Trello). Respostas do Erik em 24/09. **Nada construído ainda.**

## Quem é quem

- **Comercial** = nova **especialidade (mesa) "Comercial"**. Segue o padrão
  do portal, em que mesa é especialidade: o admin marca a pessoa em Usuários,
  sem papel novo.
- **Comercial e admin** administram a página: movem, editam, trocam o
  responsável, reabrem e fecham. **Só o admin apaga card.**
- **Colaborador sem Comercial:** vê só as oportunidades que ele pediu (é o
  solicitante) e acompanha o estágio, sem editar. Tem um contador de quantas
  trouxe no **ano civil** (zera em 1º de janeiro).
- **PJ e clientes:** sem acesso ao módulo.

## Colunas

`Pendente → Em análise → Proposta em elaboração → Aguardo cliente/Enviado → Aprovado | Reprovado → Fechado`

- Movimento livre entre as colunas. **Depois que sai de Pendente, não volta
  para lá.**
- **Sair de Pendente:** quem moveu vira o **responsável**, seja comercial ou
  admin. Colaborador sem Comercial não move. O **tipo** (Produto, Contrato,
  Serviço avulso, Prospecção) passa a ser obrigatório nesse momento.
- **Depois disso:** comercial e admin podem trocar o responsável.
- **Aprovado ou Reprovado:** depois de **2 dias corridos**, o card vai
  sozinho para Fechado. Também dá para fechar na mão antes.
- **Reprovado:** exige **motivo** (preço, concorrente, desistência, outro +
  texto).
- **Aguardo cliente:** tem **data de retorno** opcional. Quando vence, o
  responsável recebe um lembrete.
- **Fechado** fica escondido. O checkbox "Mostrar fechados" faz a coluna
  aparecer.
- **Reabrir** (responsável, comercial ou admin): o card volta para a última
  coluna em que estava (Aprovado ou Reprovado). Só avisa que foi reaberto,
  sem e-mail de troca de estágio. O prazo de 2 dias recomeça.

## Card

- **Título e descrição:** vêm do e-mail e podem ser editados.
- **Solicitante:** editável; por padrão, quem enviou o e-mail.
- **Cliente:** uma empresa cadastrada ou um nome livre ("empresa nova").
- **Tipo**, conforme descrito em Colunas.
- **Responsável**, conforme descrito em Colunas.
- **Valor estimado (R$)**, opcional.
- **Anexos:** só os anexos de verdade do e-mail. Imagens coladas no corpo
  (assinatura, rodapé) são descartadas.
- **Sem comentários nem histórico visíveis no card.** Por dentro, o sistema
  guarda cada troca de estágio, porque precisa disso para reabrir na coluna
  certa, para o ranking e para os alertas.

## Entrada

- **E-mail para a caixa de oportunidades:** vira card em Pendente. É o mesmo
  mecanismo da caixa de chamados (Microsoft 365). O endereço fica numa
  configuração do admin, para preencher quando o Azure estiver pronto.
- **Pelo portal:** qualquer colaborador cria o card, com título, descrição e
  anexo. Ele entra direto em Pendente, e o comercial recebe o aviso. Nenhum
  e-mail vai para a caixa, então não há card duplicado.

## Avisos

- **Troca de estágio:** e-mail ao solicitante **interno**. Uma chave no admin liga o envio também para solicitantes externos (desligada por padrão).
- **Pendente há 15 dias** ou **card aberto sem nenhuma alteração há 1 mês**:
  e-mail a todos os comerciais, **repetido uma vez por semana** até alguém
  agir. Aprovado, Reprovado e Fechado ficam fora.
- **Data de retorno vencida:** aviso ao responsável.
- Todo aviso também aparece no **Correio** do portal.

## Filtros e ranking

- **Filtros:** responsável, período, cliente, estágio, solicitante, tipo e
  "Mostrar fechados".
- **Ranking** (comercial e admin), com período padrão "ano atual":
  - **quem mais traz:** cards como solicitante;
  - **quem mais converte:** cards aprovados como responsável;
  - soma do valor estimado dos aprovados, quando houver valor.

## Oportunidade aprovada → Projeto ou Chamado

Botões no card aprovado. Criam o chamado ou o projeto já com cliente, título
e descrição, e deixam o link gravado no card. Usam a mesma criação das telas
de Chamado e Projeto, com as mesmas permissões.

- **Chamado:** pede só a mesa. Se o cliente tiver uma mesa só, ela já vem
  escolhida. O solicitante do chamado é o da oportunidade.
- **Projeto:** pede o orçamento (horas ou dias). **Todo projeto fica ligado
  a um chamado** (regra do módulo Projetos): usa o chamado que a
  oportunidade gerou ou um número informado.
- Só funciona com **cliente cadastrado** no card.

## E-mail: detalhes

- Os avisos saem com **"Responder para" a caixa de oportunidades**, para a
  resposta entrar no card e não virar pré-ticket na caixa de chamados.
- A leitura usa as mesmas credenciais do Azure da caixa de chamados. **Só
  entra e-mail que chegou depois de a leitura ser ligada.**

- **Resposta a e-mail de oportunidade existente:** não cria card nem
  aparece como texto; **só os anexos** dela entram no card (sem as imagens
  do corpo).

## Fica para depois

- **G.** Painel de funil.
