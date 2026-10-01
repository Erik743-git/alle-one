# Pendências do Erik — para fazer com o notebook

Lista do que **só o Erik consegue fazer** (precisa da VM, do Azure ou de uma
decisão dele). O detalhe de cada item está em `HANDOFF-20260924.md`.

Atualizado em 23/09/2026, depois do teste isolado (`TESTE-20260923.md`).

## Segurança (primeiro)

- [x] **Rotacionar `GRAPH_CLIENT_SECRET`** no Azure (feito pelo Erik, 01/10). Ele apareceu numa saída
      de terminal em 23/09 e ainda vale. Depois de gerar o novo: trocar no
      `.env` da teste **e** no da produção (são separados), reiniciar as APIs
      (`pm2 delete` + `pm2 start` em produção, nunca `pm2 restart`) e apagar o
      segredo antigo no Azure.
- [ ] Reboot da VM (kernel novo instalado). Precisa de janela, porque a
      máquina roda produção.

## Produção (3482d4c no ar desde 01/10) — conferir

- [ ] Tarja "AMBIENTE DE TESTE" **não** aparece em produção.
- [ ] Natália gera de novo o rendimento do ciclo 26/08–25/09 (HE corrigida).
- [ ] Acesso por perfil: Financeiro, Inventário, Projetos e o bloco de horas
      chegam "em construção" — conferir em Administração → Acesso por perfil.
- [ ] NPS: ligar "Participa do NPS" por empresa quando for usar (nada sai antes).
- [ ] Nginx: `grep -rn "frame-src" /etc/nginx/` — sem o snippet
      `deploy/nginx-alleone-csp-html.snippet.conf` o PDF fica bloqueado.
- [ ] LibreOffice Calc na VM (`dpkg -l libreoffice-calc`) para o "olho" do PDF.
- [ ] Modelo do e-mail de comunicação:
      `npx ts-node --transpile-only prisma/scripts/atualizar-template-comunicacao.ts`
      (sem `--aplicar` só mostra).
- [ ] E-mail de verdade: comunicação saindo pelo SMTP e a resposta voltando ao chamado.

## Próximo deploy de produção (na teste, falta ir para produção)

Commits depois de 3482d4c: relatório "Chamados atendidos" (9bfbfdb, migração
`report_type_chamados_atendidos`), mural (tarracha, arrastar, admin move,
data/hora, quem reagiu), licenciamento (3d4af68, migração
`usuario_licenciado`) e trava de contrato (cab7afb, migração `contrato_trava`).

- [ ] Conferir na teste: Chamados atendidos (admin e cliente gestor),
      licenciamento (cliente sem licença no 3º apontamento), trava de contrato
      e o mural.
- [ ] Backup antes; depois do deploy acrescentar as 3 migrações em
      `backend/prisma/migracoes-em-producao.txt`.
- [ ] **Logo depois do deploy:** `docs/handoff/LICENCIAR-CLIENTES.sql` em
      produção (ver seção Licenciamento) — senão a Fluidra trava em 2
      apontamentos por chamado.

## Decisões em aberto

- [x] **Agendas → Manutenção:** GMUD fora da janela do cliente só **avisa**
      (decidido em 23/09). **Construída** em 24/09.
- [ ] Manutenção — confirmar duas leituras que fiz sem você:
      1. O **horário da GMUD** são as atividades agendadas (início + duração)
         e, se houver, a indisponibilidade. GMUD sem atividade nem
         indisponibilidade não aparece no calendário.
      2. A GMUD é comparada com **todas** as janelas da empresa, seja a
         alteração da Alle ou do cliente. Se a ideia era comparar só com as
         janelas "da Alle", é uma linha para mudar.
- [x] Guias: fechar sozinha em **10s** (decidido 01/10; já é o padrão).
      (Hoje é 10s, e vale também para Resolver, Cancelar e Agrupar.)
- [x] (Feito 01/10, commit 52273f0) Relatório de Rendimento (planilha/PDF): tirar a comunicação de 0 min
      como na tela de Apontamentos, ou manter?
- [x] (Não mexer — 01/10) Três `COLLABORATOR` com empresa "Outros" (Rogério Carvalho, Rodrigo
      Colpani, Rangel Werner Lemos): são da Alle ou de fora?
- [ ] "Só admin tira relatório mas está confundindo do adm": o que isso quer
      dizer?
- [x] Oportunidades: desenho fechado e **construído** em 24-25/09
      (`docs/desenho/OPORTUNIDADES.md`).
- [ ] Oportunidades, para ligar: pôr as pessoas do comercial na mesa
      **Comercial** (Admin → Usuários); criar a caixa no Microsoft 365 e dar a
      ela a mesma permissão de leitura da caixa de chamados no Azure; depois,
      no quadro, ⚙ → preencher a caixa e ligar a leitura.

## Licenciamento — antes / logo depois do deploy de produção

- [ ] Logo depois do deploy: rodar `docs/handoff/LICENCIAR-CLIENTES.sql` em
      produção (1ª vez com ROLLBACK para conferir, depois COMMIT). Licencia os
      clientes **responsáveis** da Fluidra: Anderson Catarina, Anderson Gadelha,
      Dielson Gomes, Evandro Stoppa e Michel Lima Monteiro (consulta de 01/10).
      Até rodar, eles ficam com o limite de 2 apontamentos por chamado.
- [x] **Vinicius Angelo Alves (Wetzel)** — decidido: licenciar (já no script): não é responsável e chegou a 3
      apontamentos num chamado. Marcar como Responsável + Licenciado pela tela,
      ou deixar o limite valer? (decisão do Erik)
- [ ] Clientes sem licença que apontam pouco (Fluidra: Amabile, Carolina, Ruti;
      Magius: Guilherme; Ypioca: Wladimir) ficam com o limite — confirmar.
- [ ] Se um dia for preciso licenciar cliente **não** responsável (ex.: os 104
      da Fluidra), mudar a tela para a licença não depender de "Responsável"
      (hoje a edição desmarca a licença de quem não é responsável).
- [x] (Não mexer — 01/10) Terceiro (PJ): o texto de "Empresas atendidas" em Admin → Usuários
      descreve outra regra (com mesa, a empresa não limita). Trocar o texto?

## Decididos em 01/10 (não mexer)

- "Comunicação com cliente" continua marcada por padrão no apontamento.
- Título do chamado continua pré-preenchido com o nome da empresa.
- Trava de contrato: editar apontamento não passa pela trava (só criar).

## Pendentes de outras sessões

- [ ] Janela de apontamento do Santana que fecha ao clicar no aviso de erro
      (aguardando o Erik confirmar com ele).
- [ ] Oportunidades: pessoal do comercial na mesa Comercial e caixa de e-mail.

## Para o futuro (combinado deixar depois)

- [ ] Apontamentos → Colaboradores: setas ‹ › para navegar entre períodos
      (hoje fica no mês/ciclo atual; em 28/09 não dá para ver pela lista a
      folha 26/08–25/09). Pedido em 28/09, adiado pelo Erik.

## Fora do sistema

- [ ] Compartilhar os três calendários do Outlook (dona: natalia.silva) com
      `suporte@alletecnologia`. Sem isso a aba **Plantão** (dentro de Agendas)
      vem vazia. A aba Escala não depende do Outlook.
