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

- [ ] Deploy da teste (três migrations novas, todas só criam tabela):
      ```bash
      sudo -u alleone -i env ALLEONE_BRANCH=teste/integracao-20260923 bash /home/alleone/teste/deploy/scripts/pos-deploy-alleone-teste.sh
      ```
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
      (decidido em 23/09).
- [ ] Guias: fechar sozinha em **10s** ou **30s** depois de fechar o chamado?
      (Hoje é 10s, e vale também para Resolver, Cancelar e Agrupar.)
- [ ] Relatório de Rendimento (planilha/PDF): tirar a comunicação de 0 min
      como na tela de Apontamentos, ou manter?
- [ ] Três `COLLABORATOR` com empresa "Outros" (Rogério Carvalho, Rodrigo
      Colpani, Rangel Werner Lemos): são da Alle ou de fora?
- [ ] "Só admin tira relatório mas está confundindo do adm": o que isso quer
      dizer?
- [ ] Oportunidades (kanban por e-mail): 7 perguntas em aberto.

## Fora do sistema

- [ ] Compartilhar os três calendários do Outlook (dona: natalia.silva) com
      `suporte@alletecnologia`. Sem isso a aba **Plantão** (dentro de Agendas)
      vem vazia. A aba Escala não depende do Outlook.
