# Pendências do Erik — para fazer com o notebook

Lista do que **só o Erik consegue fazer** (precisa da VM, do Azure ou de uma
decisão dele). O detalhe de cada item está em `HANDOFF-20260924.md`.

Atualizado em 23/09/2026.

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
- [ ] Rodar a lista de conferência da seção 3 do `HANDOFF-20260924.md` na
      teste (itens 3.1 a 3.8).

## Decisões em aberto

- [ ] **Agendas → Manutenção:** GMUD fora da janela do cliente **bloqueia**
      ou só **avisa**? Recomendação: só avisar (bloquear trava emergência de
      madrugada).
- [ ] Guias: fechar sozinha em **10s** ou **30s** depois de fechar o chamado?
- [ ] Três `COLLABORATOR` com empresa "Outros" (Rogério Carvalho, Rodrigo
      Colpani, Rangel Werner Lemos): são da Alle ou de fora?
- [ ] "Só admin tira relatório mas está confundindo do adm": o que isso quer
      dizer?
- [ ] Oportunidades (kanban por e-mail): 7 perguntas em aberto.

## Fora do sistema

- [ ] Compartilhar os três calendários do Outlook (dona: natalia.silva) com
      `suporte@alletecnologia`. Sem isso a aba Plantão vem vazia.
