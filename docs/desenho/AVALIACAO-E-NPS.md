# Avaliação de chamados e NPS — desenho para aprovação

O módulo de avaliação passa a ter duas partes. Respostas do Erik em 25/09.
**Construído em 24/09 (sandbox)** — ver "Como ficou" no fim.

## 1. Avaliação do chamado (como hoje, com o pop-up)

Continua **1 a 5 estrelas**, por chamado fechado, enviada por e-mail no
fechamento. Muda:

**Pop-up no login** para cliente gestor e cliente membro:

- Mostra só os chamados **em que a pessoa é o solicitante**.
- **No máximo uma vez por dia.**
- Mostra o chamado fechado **mais recente ainda sem nota**, dos **últimos 30
  dias**.
- Fechar o pop-up sem avaliar dispensa aquele chamado: **ele não volta**. No
  dia seguinte, se nenhum chamado novo foi fechado, aparece o anterior.
- Chamado avaliado ou cancelado nunca aparece.

## 2. NPS (novo)

- **Pergunta:** "De 0 a 10, quanto você recomendaria a Alle?" e um campo
  opcional "Por quê?".
- **Quem recebe:** os **clientes gestores** das empresas que participam
  (ver pergunta em aberto).
- **Na tela de Clientes:** "Participa do NPS" (liga e desliga) e "A cada N
  meses" (padrão 3).
- **Envio:** um e-mail com um link que leva a uma **página do portal**, onde
  a pessoa dá a nota de 0 a 10.
- **Também no login:** gestor com NPS pendente vê o pop-up do NPS. Ele tem
  prioridade sobre o da avaliação de chamado, e os dois nunca aparecem no
  mesmo dia.
- **Nota 6 ou menos:** e-mail aos admins com a empresa, a pessoa, a nota e o
  comentário, além do aviso no Correio.

**A conta do NPS:** % de promotores (9 e 10) menos % de detratores (0 a 6).
Neutros (7 e 8) contam no total, mas não somam nem subtraem. O resultado vai
de −100 a +100. É calculado **global** e também por empresa e por trimestre.

## Painel

Administração → Satisfação ganha duas abas:

- **Avaliação de chamados:** a de hoje.
- **NPS:** nota NPS global, evolução por trimestre, por empresa, quantos
  responderam e os comentários, com os detratores em destaque.

## Como ficou (construído)

- **Quem recebe:** escolhido por empresa em Administração → Empresas →
  Editar (seção NPS): "Participa do NPS", "A cada N meses" (1 a 24, padrão
  3) e a lista de usuários do portal daquela empresa. A API recusa usuário
  de outra empresa ou da equipe.
- **Envio:** rotina diária às 09:00 (Brasília). Cada pessoa recebe quando o
  último envio dela passou do intervalo. E-mail com os números 0–10
  clicáveis; o clique grava a nota na hora.
- **Link sem login** (`/nps/<token>`, 48 caracteres aleatórios, limite de
  20–30 tentativas por minuto por IP). Pode trocar a nota e escrever o
  porquê por 24 h.
- **Nota 0–6:** um e-mail para todos os admins ativos (empresa, pessoa,
  nota e porquê) e aviso no Correio. Sai uma vez só por resposta.
- **Pop-up no portal do cliente:** NPS pendente primeiro; senão a avaliação
  do chamado mais recente em que a pessoa é a solicitante (últimos 30 dias,
  sem nota, não dispensado, não cancelado). No máximo um por dia (meia-noite
  de Brasília). "Agora não" ou fechar = não volta mais no pop-up (o link do
  e-mail continua valendo).
- **Painel:** Administração → Satisfação com as abas "Avaliação de
  chamados" (a de antes; o número que se chamava "NPS" virou "Índice das
  estrelas", para não confundir) e "NPS" (global, por trimestre, por
  empresa, taxa de resposta e comentários com detratores primeiro).
- **Correção junto:** o link de avaliação do e-mail (`/satisfacao/<token>`)
  mandava para o login quem não estava logado. Agora abre direto.

## Perguntas respondidas

- Quem recebe: parametrizado por empresa (pessoas escolhidas).
- O link pede login? Não: o token é da pessoa para quem foi enviado.
