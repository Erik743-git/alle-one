# Pendências do Erik — para fazer com o notebook

Lista do que **só o Erik consegue fazer** (precisa da VM, do Azure ou de uma
decisão dele). O detalhe de cada item está em `HANDOFF-20260924.md`.

Atualizado em 23/09/2026, depois do teste isolado (`TESTE-20260923.md`).

## Segurança (primeiro)

- [ ] **Rotacionar `GRAPH_CLIENT_SECRET`** no Azure. Ele apareceu numa saída
      de terminal em 23/09 e ainda vale. Depois de gerar o novo: trocar no
      `.env` da teste **e** no da produção (são separados), reiniciar as APIs
      (`pm2 delete` + `pm2 start` em produção, nunca `pm2 restart`) e apagar o
      segredo antigo no Azure.
- [ ] Reboot da VM (kernel novo instalado). Precisa de janela, porque a
      máquina roda produção.

## Colocar a teste no ar (nada de hoje está lá ainda)

- [ ] Deploy da teste (**sete** migrations novas, todas só criam tabela ou
      tipo — `20260924120000_manutencao_janelas`,
      `20260925090000_oportunidades`, que também cria a mesa **Comercial**,
      `20260925150000_acesso_por_perfil`, que grava o acesso de hoje, e
      `20260926090000_nps`):
      ```bash
      sudo -u alleone -i env ALLEONE_BRANCH=teste/integracao-20260923 bash /home/alleone/teste/deploy/scripts/pos-deploy-alleone-teste.sh
      ```
- [ ] Depois do deploy: abrir **Administração → Acesso por perfil** e
      conferir. Financeiro, Inventário, Projetos e o bloco de horas chegam
      **em construção** (igual à produção). Na teste, para ver como antes,
      desligue "Em construção" deles. A variável
      `NEXT_PUBLIC_MODULOS_DESABILITADOS` pode sair do .env depois.
- [ ] NPS: em Administração → Empresas, ligar "Participa do NPS" e escolher
      quem recebe. Nada é enviado até alguém ligar.
- [ ] Nginx: `grep -rn "frame-src" /etc/nginx/`, copiar
      `deploy/nginx-alleone-csp-html.snippet.conf` para lá, `sudo nginx -t`,
      `sudo systemctl reload nginx`. Sem isso o PDF continua bloqueado.
- [ ] Modelo do e-mail de comunicação:
      `cd /home/alleone/teste/backend && npx ts-node --transpile-only prisma/scripts/atualizar-template-comunicacao.ts`
      (sem `--aplicar` só mostra; com `--aplicar` grava).
- [ ] Na VM, conferir se o **LibreOffice Calc** está instalado:
      `dpkg -l libreoffice-calc`. Só o `libreoffice-core` não basta: o botão
      do olho aparece e a visualização dá erro 503. Se faltar:
      `sudo apt install --no-install-recommends libreoffice-calc`.
- [ ] Conferência rápida na teste. Os itens 3.1 a 3.8 já passaram numa cópia
      isolada (ver `TESTE-20260923.md`); na teste falta só o que depende da
      VM: o PDF atrás do nginx de verdade, o e-mail saindo pelo SMTP de
      verdade e a resposta desse e-mail voltando ao chamado.

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
- [ ] Guias: fechar sozinha em **10s** ou **30s** depois de fechar o chamado?
      (Hoje é 10s, e vale também para Resolver, Cancelar e Agrupar.)
- [ ] Relatório de Rendimento (planilha/PDF): tirar a comunicação de 0 min
      como na tela de Apontamentos, ou manter?
- [ ] Três `COLLABORATOR` com empresa "Outros" (Rogério Carvalho, Rodrigo
      Colpani, Rangel Werner Lemos): são da Alle ou de fora?
- [ ] "Só admin tira relatório mas está confundindo do adm": o que isso quer
      dizer?
- [x] Oportunidades: desenho fechado e **construído** em 24-25/09
      (`docs/desenho/OPORTUNIDADES.md`).
- [ ] Oportunidades, para ligar: pôr as pessoas do comercial na mesa
      **Comercial** (Admin → Usuários); criar a caixa no Microsoft 365 e dar a
      ela a mesma permissão de leitura da caixa de chamados no Azure; depois,
      no quadro, ⚙ → preencher a caixa e ligar a leitura.

## Fora do sistema

- [ ] Compartilhar os três calendários do Outlook (dona: natalia.silva) com
      `suporte@alletecnologia`. Sem isso a aba **Plantão** (dentro de Agendas)
      vem vazia. A aba Escala não depende do Outlook.
