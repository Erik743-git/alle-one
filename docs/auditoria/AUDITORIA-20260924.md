# Auditoria do Alle One — 24/09/2026

Branch auditada: `claude/teste-integracao-20260923-b9xjyl` (a teste de
23/09 + correções). Feita numa cópia isolada, só com dados inventados: build
de produção, nginx com os snippets de `deploy/`, HTTPS. **Nada foi feito na
VM, na teste ou na produção.**

## Como foi testado

- **API por perfil:** as 146 rotas de leitura (252 variações) chamadas por
  admin, dois colaboradores, terceiro (PJ), cliente gestor, cliente membro e
  sem login, sempre com identificadores **de outra empresa**, procurando
  vazamento.
- **Alterações por perfil:** 35 tentativas de escalar privilégio ou mexer no
  que não é seu (virar admin, trocar de empresa, editar chamado, apontamento
  e empresa dos outros, criar usuário).
- **Telas:** as 43 telas × 5 perfis (215 visitas) no navegador, registrando
  erros, chamadas que falham, redirecionamentos e vazamentos na tela.
- **Ataques práticos:** XSS pela descrição do apontamento e por anexo, SQL
  injection (revisão das 39 consultas manuais), login e recuperação de senha,
  revogação de sessão, limite de tentativas.
- **Código:** dependências (`npm audit`), segredos no repositório, erros
  engolidos em silêncio, regras de negócio de GMUD, horas e pré-ticket.

## O que está sólido

- **Isolamento entre empresas:** nenhum cliente (gestor ou membro) recebeu
  dado de outra empresa em nenhuma rota ou tela.
- **Escalada de privilégio:** todas as 35 tentativas foram barradas. O
  cliente membro não altera chamado; só o gestor altera.
- **SQL injection:** as consultas manuais só colam trechos fixos; valores
  vão como parâmetro.
- **Login:** mesma mensagem para e-mail inexistente e senha errada; conta
  bloqueia após 10 erros por 15 min.
- **Recuperação de senha:** código aleatório seguro, guardado em hash, com
  limite de 5 tentativas a cada 15 min.
- **Configuração:** cookies `HttpOnly`/`Secure`/`SameSite`, CORS restrito,
  `helmet`, Swagger desligado em produção, CSP ativa.
- **GMUD:** aprovação atômica; "em nome de" é só para admin e exige evidência.
- **Hora extra e justificativas:** só o admin decide, com auditoria.
- **Mural:** anonimato íntegro, inclusive para o admin e no Correio.

## Corrigido nesta auditoria (já no GitHub)

| # | Gravidade | O que era | Commit |
|---|---|---|---|
| C1 | **Crítica** | **XSS armazenado.** A descrição do apontamento era mostrada como HTML cru. Qualquer um que aponta (colaborador, PJ, cliente gestor) gravava pela API um `<iframe srcdoc>` que **rodava script na sessão do admin** ao abrir o chamado, além de redirecionar para site externo e exibir formulário falso de senha. A própria limpeza do editor deixava passar o que estivesse dentro de uma tag proibida. | `490476e` |
| C2 | **Crítica** | **XSS por anexo.** Um `.html` pedido com `?inline=true` abria como página do portal, e um `.js` anexado passava pela CSP da API. **Confirmado: o script leu os dados da conta do admin.** Valia para anexos de chamado, de **e-mail recebido (qualquer remetente externo)**, do financeiro e do inventário. Agora só imagem, PDF e texto abrem no navegador. | `0090d20` |
| C3 | **Crítica** | **Um GET anônimo derrubava a API.** `/api/auth/google` (ou `/microsoft`) sem o provedor configurado encerrava o processo inteiro (promessa disparada com `void`). | `490476e` |
| C4 | Alta | **Folha:** cada comunicação (início = fim) somava **1 minuto** de hora normal no total do mês. | `516d72a` |
| C5 | Média | **Testes:** o Jest não carregava a biblioteca do 2FA. As "6 falhas antigas" eram isso; as suítes de login e usuários nunca rodavam. Agora rodam e mostram 6 testes com dados falsos desatualizados (ver P14). | `490476e` |

## Pendente — precisa de decisão ou de trabalho

### Alta

| # | Achado | Recomendação |
|---|---|---|
| P1 | **Apontamento aceita qualquer data:** 2020 (antes do chamado existir), 2030, amanhã. Não há trava de período fechado. Mexe em folha já paga e em cobrança já emitida. | Proibir data futura; travar o ciclo de folha fechado (26→25), com reabertura só pelo admin e registro na auditoria. |
| P2 | **Mesma pessoa, mesma hora, dois chamados:** aceito. A tela só avisa, e a API nem avisa. É a mesma hora cobrada de dois clientes. **O cliente vê o efeito:** no teste, a Carla viu 29,98 h "excedentes" vindas de apontamentos falsos. | Bloquear a sobreposição, ou exigir justificativa aprovada pelo admin. |
| P3 | **Dependências com falha conhecida:** Next.js 16.1.7 (**crítica**, queda do servidor), `multer` (DoS no upload), `path-to-regexp` (DoS nas rotas), `nodemailer`, `lodash` e outras: 20 no backend e 21 no frontend, todas com correção disponível. | Atualizar numa branch própria, com teste completo antes de ir para a teste. |
| P4 | **IP real atrás da Cloudflare:** o nginx não reconhece os endereços da Cloudflare. A API provavelmente vê o IP da Cloudflare e não o da pessoa. Isso afeta o limite de login (10/min por IP, possivelmente compartilhado por todos) e a auditoria. | Conferir na VM se os IPs da tabela `audit_logs` são da Cloudflare. Se forem, usar `set_real_ip_from` com as faixas da Cloudflare e `real_ip_header CF-Connecting-IP`. |

### Média

| # | Achado | Recomendação |
|---|---|---|
| P5 | **Logout não invalida a sessão:** o cookie copiado segue valendo até expirar (1 dia). | No logout, incrementar o `tokenVersion` (derruba todas as sessões da pessoa) ou manter uma lista de tokens revogados. |
| P6 | **O servidor não limpa o HTML ao gravar.** A tela agora limpa (C1), mas a limpeza do e-mail é por expressão regular, fácil de contornar. | Limpar no backend com biblioteca de lista permitida (`sanitize-html`) ao gravar descrição e comunicação. |
| P7 | **E-mail recebido sem checagem de autenticidade:** "De" falsificado vale como remetente; remetente da equipe interna entra em qualquer chamado. | Aceitar como remetente conhecido só com `dmarc=pass` no cabeçalho `Authentication-Results`. Conferir se o DMARC do domínio está em `p=reject`. |
| P8 | **Terceiro (PJ) vê contatos de clientes de todas as empresas** (nome, e-mail, papel) nas buscas de usuários de GMUD e Projetos. É ponto de LGPD. | Limitar ao escopo do PJ (empresas e mesas dele). |
| P9 | **PJ vê a fila inteira da mesa, de todas as empresas**, com anexos, e pode editar esses chamados. É intencional ("a mesa manda"). | **Decidido em 24/09: manter.** Terceiro definido por mesa vê a fila inteira dela. |
| P10 | **GMUD sem separação de funções:** quem cria pode se pôr como aprovador e aprovar a própria mudança. | **Decidido em 24/09: manter.** Quem cria pode aprovar a própria GMUD. |
| P11 | **Pré-ticket apagado sem rastro:** colaboradores apagam e-mails de clientes (inclusive em massa) sem registro de quem apagou. | Gravar `deletedBy` e pôr `@AuditMeta` nas rotas de exclusão. |
| P12 | **Sem faixa de ambiente de teste** (regra do projeto). | Variável `NEXT_PUBLIC_AMBIENTE=teste` no build da teste e uma tarja fixa no topo, com cor própria. |

### Baixa

| # | Achado |
|---|---|
| P13 | Usuário desativado ainda passa por até **30 s** (cache de permissões). |
| P14 | 6 testes de login e usuários com dados falsos desatualizados (falta `findUnique` e `upsert`): não protegem o login hoje. |
| P15 | Erros do Zabbix respondem 500 e mostram ao cliente nomes de variável do `.env` ("ZABBIX_URL não definida"). Deveria ser 503 com mensagem genérica. |
| P16 | Erros engolidos sem log: a contagem de senha errada (se falhar, o bloqueio não conta) e a linha de histórico "resposta por e-mail". |
| P17 | A recuperação de senha devolve o código na resposta se `NODE_ENV` não for `production`. Teste e produção estão certos; é risco de configuração em servidor novo. |
| P18 | A aprovação de hora extra consulta `tiflux.ticket_appointments` direto. Se o espelho do TiFlux for desligado, a tela quebra (500). |
| P19 | Telas de admin abertas por quem não é admin mostram "Sem permissão" (e, em `/admin/empresas`, um erro não tratado no console) antes de redirecionar. |
| P20 | As migrations não rodam num banco vazio, e a pesquisa de satisfação tem diferença entre migration e esquema (ver `docs/handoff/TESTE-20260923.md`). |

## Tela e usabilidade

| # | Achado |
|---|---|
| U1 | Os avisos (toasts) aparecem em cima dos botões do topo da tela (ex.: "Pré-tickets" e "Atualizar" na lista de tickets). Melhor no canto inferior. |
| U2 | Guias com o mesmo nome ("Projetos" três vezes, sem a empresa) e "Plantao" sem acento. |
| U3 | Termos em inglês no painel: "Alertas High", "Alertas Disaster". |
| U4 | Números fora do padrão brasileiro: "29.98h" (horas decimais com ponto) e "R$ 0.00". O esperado é "29h59" e "R$ 0,00". |
| U5 | Dez diálogos antigos presos em 384 px de largura; "Terça-Feira" com F maiúsculo na Escala. |
| U6 | O campo de data do apontamento não tem mínimo nem máximo (ligado a P1). |

## Ideias de melhoria

- **Fechamento de período** com reabertura controlada (resolve P1 e dá
  segurança à cobrança).
- **Conferência de horas antes de faturar:** relatório de sobreposições e de
  apontamentos fora do padrão (mais de 12 h no dia, fim de semana sem
  plantão) para o admin revisar antes de fechar o mês.
- **Tarja de ambiente** (P12), também útil nos e-mails da teste.
- **Horas sempre em h:mm** em todo o portal.

## Não coberto nesta rodada

- **Telas no celular** para todos os perfis. Só a aba Manutenção, o pop-up
  de atenção e o Mural foram vistos em 390 px.
- **Histórico completo do git** atrás de segredos: o clone aqui é parcial.
  Rodar no notebook: `git log --all -p | grep -iE "secret|password|token" | less`.
- Integrações reais (TiFlux, Zabbix, Grafana, Microsoft 365), que não existem
  na cópia isolada.

## Ordem sugerida

1. **Já:** levar C1, C2 e C3 para a teste e, depois, para a produção. São
   as três exploráveis hoje.
2. P4 (IP na VM, só conferir) e P3 (dependências).
3. P1 e P2 (horas e cobrança), depois das decisões.
4. P5 a P12.
5. Baixa e usabilidade, junto com outras entregas.
