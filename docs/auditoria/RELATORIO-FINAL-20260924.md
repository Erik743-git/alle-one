# Relatório final — Alle One, 24/09/2026

Branch: `claude/teste-integracao-20260923-b9xjyl` (a teste de 23/09 +
tudo abaixo). Tudo foi testado numa **cópia isolada, com dados inventados**
(build de produção, nginx com os snippets de `deploy/`, HTTPS, e-mail preso
num servidor falso). **Nada foi feito na VM, na teste ou na produção.**

## Resumo em 30 segundos

- **Construído e testado:** Acesso por perfil, Avaliação + NPS, Fechamento
  do mês, Carga da equipe, Aviso de contrato (80%/100%), Oportunidades,
  aba Manutenção e a tarja de ambiente de teste.
- **Corrigido:** 3 falhas críticas de segurança (duas de XSS e uma queda da
  API), a folha que somava 1 minuto por comunicação, o link de avaliação do
  e-mail que mandava para o login e o aviso cortado no celular.
- **Testes:** 529 testes do backend e 128 do frontend passando. Continuam
  falhando os mesmos 6 testes antigos de login e usuários, com dados falsos
  desatualizados (P14). Foram 1.974 chamadas de API por perfil, 94 casos da
  matriz de acesso e 470 visitas de tela (computador e celular). **Nenhum
  vazamento entre empresas, nenhuma escalada de privilégio, nenhuma tela
  quebrada no celular.**
- **Pronto para a teste:** sim. **Pronto para produção:** falta passar pela
  teste de verdade (o que depende da VM, do TiFlux, do Zabbix e do e-mail
  real). Antes disso, recomendo tratar **P3** (Next.js com falha crítica) e
  **P4** (IP real atrás da Cloudflare). Ver "Antes de ir para produção".

## 1. O que mudou — antes e depois

### Funcionalidades novas

| Item | Antes | Depois |
|---|---|---|
| **Acesso por perfil** (Administração) | Módulo só sumia do menu, via variável de ambiente que exigia recompilar. **A API continuava aberta.** Agendas, Mural, Oportunidades e Pré-tickets fixos no código; Relatórios só admin, ignorando a permissão do usuário. | Tabela módulo × perfil, com "Em construção" (só admin vê). Muda na hora, sem recompilar. **A API responde 403** e o menu, os botões e as guias somem. A URL direta mostra "módulo indisponível". Administração fica fora da tabela. Toda mudança entra na Auditoria. |
| **NPS** | Não existia. O "NPS" do painel era calculado das estrelas. | Pergunta 0–10 + "por quê". Quem recebe é escolhido por empresa, a cada N meses. O link do e-mail não pede login. Nota 0–6 avisa os admins por e-mail e no Correio. Painel com NPS global, por trimestre e por empresa, e comentários com detratores primeiro. |
| **Pop-up de satisfação** | Não existia. | Aparece para cliente gestor e membro, no máximo uma vez por dia, com o NPS antes da avaliação. Só chamados em que a pessoa é a solicitante, dos últimos 30 dias. "Agora não" não volta e chamado cancelado fica de fora. |
| **Fechamento do mês** (Apontamentos) | Qualquer data era aceita; nada travava período já pago (P1). | Aba Fechamento com o ciclo 26→25 e a conferência: sobreposição, dia com mais de 12 h, fim de semana sem plantão e lançamento atrasado. **"Fechar ciclo" trava criar, editar, mover e apagar para todos, admin inclusive.** Reabrir exige motivo e fica no histórico e na Auditoria. |
| **Carga da equipe** (Apontamentos) | Não existia. | Chamados abertos, parados (48 h) e sem responsável, por mesa e por técnico, e as horas da semana contra a jornada. O admin sempre vê; o colaborador, só se for liberado em Acesso por perfil. |
| **Aviso de contrato** | Só um alerta no Correio (30%–70%), sem e-mail. | Em 80% e 100% das horas do mês, e-mail e Correio para admins e mesa Comercial; o gestor do cliente não recebe. Em 100%, abre sozinho a oportunidade "Renovação/ampliação de contrato" em Pendente, sem duplicar. |
| **Oportunidades** | Não existia. | Quadro com 7 colunas, leitura de caixa de e-mail, responsável, filtros, ranking, alertas de parado e de retorno, e conversão em chamado ou projeto. |
| **Agendas → Manutenção** | Não existia. | Calendário com as janelas de manutenção dos clientes e as GMUDs por cima. |
| **Tarja de teste** | Nenhuma diferença visual entre teste e produção (P12). | Moldura âmbar e selo "Ambiente de teste". Aparece com `NEXT_PUBLIC_AMBIENTE=teste` ou quando o endereço tem "teste", "homolog" ou "staging". Produção nunca mostra. |

### Correções

| # | Antes | Depois | Commit |
|---|---|---|---|
| C1 | **XSS armazenado:** descrição de apontamento com `<iframe srcdoc>` rodava script na sessão do admin. | Descrição limpa por lista permitida na tela; a limpeza também descarta o conteúdo das tags proibidas. | `490476e` |
| C2 | **XSS por anexo:** `.html` ou `.js` anexado (inclusive por e-mail de fora) abria como página do portal. | Só imagem, PDF e texto abrem no navegador; o resto baixa. Vale para chamado, e-mail, financeiro e inventário. | `0090d20` |
| C3 | **GET anônimo em `/api/auth/google` derrubava a API inteira.** | Erro tratado; a API continua de pé. | `490476e` |
| C4 | Cada comunicação somava **1 minuto** na folha. | Comunicação (início = fim) conta 0. | `516d72a` |
| C5 | Testes de login e usuários nem rodavam (biblioteca do 2FA). | Rodam; 6 deles têm dados falsos desatualizados (P14). | `490476e` |
| — | Link de avaliação do e-mail (`/satisfacao/<token>`) **mandava para o login** quem não estava logado. | Abre direto (o mesmo vale para `/nps/<token>`). | `ca0a2af` |
| — | Guia fechava a errada ao fechar ticket; diálogos presos a 384 px no celular; tela vazia "Sem permissão" em Mural e Agendas; texto do e-mail de apontamento com HTML cru. | Corrigidos no teste isolado de 23/09. | `3941ca2` |
| — | Aviso (toast) cortado na borda esquerda no celular. | Cabe na tela, com margem dos dois lados. | `0e1a07c` |
| — | Datas de Oportunidades no formato do navegador (mm/dd/yyyy em alguns). | Seletor pt-BR do portal, igual às outras telas. | `0e1a07c` |

## 2. Segurança — o que mudou

| Ponto | Antes | Depois |
|---|---|---|
| Módulo desligado | Só escondia o menu; a API respondia normalmente. | Guard global responde 403 por perfil. Admin sempre passa. |
| Relatórios | Trava fixa "só admin", ignorando a permissão. | Tabela de acesso + permissão REPORTS da pessoa. Cliente e terceiro ficam travados em código até uma revisão de recorte. |
| XSS | Dois caminhos confirmados (C1, C2). | Fechados. |
| Queda da API | GET anônimo derrubava (C3). | Fechado. |
| Links públicos novos (`/nps/<token>`) | — | Token de 48 caracteres aleatórios, limite de 20–30 tentativas por minuto por IP e dados mínimos na resposta. |
| Dispensar pop-up | — | Só a própria pessoa dispensa a própria pesquisa: o token de outro usuário responde `ok:false`. |
| NPS por empresa | — | A API recusa destinatário de outra empresa ou da equipe interna. |
| Horas já fechadas | Editáveis por qualquer um que aponta. | Travadas por ciclo; reabrir só admin, com motivo e auditoria. |
| E-mails novos (NPS, contrato, nota baixa) | — | Todo texto vindo de cliente sai escapado no HTML. |
| Tela do admin de acesso | — | Não inclui Administração: não dá para desligar nem liberar por engano. |

## 3. Como foi testado e o que deu

| Teste | Tamanho | Resultado |
|---|---|---|
| **API de leitura por perfil** (admin, 2 colaboradores, terceiro, cliente gestor, cliente membro, sem login), com IDs de outra empresa | 164 rotas, 282 variações, 1.974 chamadas | **Cliente: zero vazamento.** Colaborador e terceiro veem outras empresas, como decidido (terceiro pela mesa). Sem login, só rotas públicas. Os únicos 500 são do Zabbix, que não existe na cópia (P15). |
| **Tempo de resposta da API** | mesmas 1.974 chamadas | Mediana de **2 ms**, p95 de **9 ms**. A mais lenta foi a disponibilidade do visualizador de PDF (333 ms). |
| **Escrita/escalada** (virar admin, trocar de empresa, editar apontamento, chamado e empresa dos outros) | a mesma bateria de 35 tentativas da auditoria | **Todas barradas.** O único 200 é o terceiro editando chamado da própria mesa em outra empresa, como decidido. |
| **Acesso por perfil** (liga/desliga cada módulo × cada perfil, "em construção", admin nunca bloqueado, perfil fora do catálogo recusado) | **94 casos** | **0 falhas.** |
| **NPS** (configuração, envio, repetição, intervalo de 3 meses, link, nota inválida, alerta único, comentário mantido, painel, permissões) | ~25 casos | OK. |
| **Pop-up** (um por dia, prioridade do NPS, dispensado não volta, cancelado some, janela de 30 dias, token de outro usuário) | ~12 casos | OK. |
| **Fechamento** (4 conferências, fechar só após o dia 25, travas em criar/editar/mover/apagar, admin também travado, reabrir com motivo, só admin) | ~20 casos | OK. |
| **Carga da equipe** (totais, por mesa, por técnico, liberar para colaborador) | ~8 casos | OK. |
| **Aviso de contrato** (80%, 100%, sem repetir, pulo direto para 100%, renovação sem duplicar, destinatários) | 6 cenários | OK. O gestor do cliente não recebe. |
| **Telas** (47 telas × 5 perfis × computador 1440 px e celular 390 px) | **470 visitas** | **0 rolagem lateral, 0 elemento cortado no celular.** Carga mediana de 0,9 s (p95 1,2 s). Nenhum erro de JavaScript novo. |
| **Testes automáticos** | backend 535 · frontend 128 | 529 + 128 passam; falham os mesmos 6 de sempre (P14). |
| **Dependências** (`npm audit`) | — | Continua a P3: 1 crítica no frontend (Next.js) e 16 altas no backend. Não atualizei (ver P3). |

## 4. O que falta testar (não dá na cópia isolada)

- **Na teste (VM):** o deploy com as **10 migrations**; o PDF atrás do nginx
  real; e-mail saindo pelo SMTP real (NPS, contrato, oportunidades); a
  resposta de e-mail voltando ao chamado e ao card.
- **Integrações reais:** TiFlux, Zabbix, Grafana e Microsoft 365 (a leitura
  da caixa de oportunidades). Na cópia, o espelho do TiFlux não existe, e
  duas telas dão 500 por isso: aprovação de hora extra (P18) e Console
  (P15).
- **Mais de uma instância da API:** mudança em Acesso por perfil leva até
  30 s para valer nas outras (cache por processo).
- **Navegadores reais:** Safari no iPhone e Chrome no Android. Testei no
  Chromium com tela de celular.
- **Volume:** a Carga e o Aviso de contrato com centenas de chamados e
  empresas. O aviso chama o cálculo de horas do painel por empresa, de hora
  em hora, até avisar as duas faixas do mês.

## 5. O que falta fazer

### Antes de ir para produção

1. **P3 — Dependências:** o Next.js tem falha crítica (queda do servidor),
   com correção na 16.3.6. Backend: `multer`, `path-to-regexp`,
   `nodemailer`, Nest e Prisma. Fazer numa branch própria e repetir esta
   bateria.
2. **P4 — IP real atrás da Cloudflare:** conferir `audit_logs` na VM. Sem
   isso, o limite de login pode ser compartilhado por todos.
3. **Deploy da teste** com a lista de `docs/handoff/PENDENCIAS.md`
   (migrations, nginx, modelo de e-mail, LibreOffice Calc).
4. **Configurar depois do deploy:**
   - Acesso por perfil (conferir o que está "em construção");
   - NPS por empresa (nada é enviado até alguém ligar);
   - `NEXT_PUBLIC_AMBIENTE=teste` no build da teste (opcional se o endereço
     já tiver "teste").

### Pendências da auditoria que continuam abertas

| # | Gravidade | Situação |
|---|---|---|
| P1 | Alta | **Em parte:** o ciclo fechado trava as horas. Ainda falta proibir data futura (2030, amanhã). |
| P2 | Alta | **Em parte:** sobreposição agora aparece na conferência do Fechamento; a API ainda aceita. Decidir se bloqueia. |
| P3 | Alta | Aberta (dependências). |
| P4 | Alta | Aberta (conferir na VM). |
| P5 | Média | Logout não invalida o token. |
| P6 | Média | O servidor não limpa HTML ao gravar (a tela limpa). |
| P7 | Média | E-mail recebido sem checagem de DMARC. |
| P8 | Média | Terceiro vê contatos de clientes de todas as empresas nas buscas de GMUD e Projetos (LGPD). |
| P11 | Média | Pré-ticket apagado sem registro de quem apagou. |
| P12 | Média | **Resolvida:** tarja de teste. |
| P13–P20 | Baixa | Como no relatório de auditoria. P19 continua: telas de admin abertas por não admin mostram "Sem permissão" e, em Empresas, um erro no console. |
| U1 | Tela | **Em parte:** o aviso não sai mais cortado; ainda cobre os botões do topo. Mudar para o canto inferior? |
| U4 | Tela | **Em parte:** telas novas usam "29h59"; as antigas ainda mostram "29.98h" e "R$ 0.00". |

### Pequenas coisas vistas nesta rodada

- Admin no **Financeiro** abre na empresa "Alle Tecnologia", que não tem
  cliente vinculado, e recebe o aviso "Empresa sem cliente vinculado".
  Melhor abrir na primeira empresa com cliente.
- `/financial/overview` sem empresa responde 403; deveria ser 400.
- O responsável do chamado é ligado ao usuário pelo **nome** (Correio e
  Carga). Um nome diferente no TiFlux e no portal não conta para a pessoa.

### Decisões em aberto (suas)

1. **Oportunidades:** mandar e-mail ao mover para Fechado? Bloquear anexo
   HTML/SVG/JS no portal inteiro, e não só em Oportunidades?
2. **Fechamento:** travar também justificativas e aprovação de horas extras
   do ciclo fechado?
3. **Terceiro (PJ):** liberar Agendas, Mural ou Pré-tickets exige ajustar
   essas telas (hoje listam só a equipe CLT). Vale fazer?
4. **Relatórios para cliente:** as rotas precisam de revisão de recorte
   antes de liberar.
5. **P2:** bloquear a sobreposição de horas na API ou só apontar na
   conferência?

## 6. Ideias para frente (nada feito — para conversar)

- **Aviso de horas antes de estourar, para o cliente gestor**, com opção
  por empresa. Hoje só a equipe recebe.
- **Previsão de consumo:** projetar o fim do mês pelo ritmo atual e avisar
  já no dia 20 que vai estourar.
- **Conferência automática antes de fechar:** e-mail no dia 26 para o admin
  com o resumo da conferência do ciclo.
- **NPS com ação:** detrator vira uma tarefa com responsável e prazo, com
  retorno registrado no painel.
- **Horas sempre em h:mm e dinheiro em R$ 0,00** no portal inteiro (U4).
- **Tempo de resposta por mesa:** primeiro atendimento e resolução, no painel
  de Carga.
- **Relatório mensal para o cliente gestor:** horas, chamados e NPS da
  empresa em PDF, enviado no fechamento do ciclo.

## 7. Onde está cada coisa

- Desenhos aprovados: `docs/desenho/` (Oportunidades, Acesso por perfil,
  Avaliação e NPS, Fechamento e Carga, Aviso de contrato).
- Auditoria de segurança: `docs/auditoria/AUDITORIA-20260924.md`.
- Lista do que depende de você (deploy, segredos, decisões):
  `docs/handoff/PENDENCIAS.md`.
- Teste isolado de 23/09: `docs/handoff/TESTE-20260923.md`.
