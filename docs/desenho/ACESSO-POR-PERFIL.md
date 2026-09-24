# Acesso por perfil — desenho para aprovação

Módulo novo em **Administração**. Respostas do Erik em 25/09. **Nada
construído ainda.**

## Objetivo

Subir tudo para produção sem liberar módulo incompleto, e escolher, por tipo
de usuário, quem acessa cada módulo. Muda na hora, sem recompilar.

## A tela

Uma tabela com os **módulos nas linhas** e os **perfis nas colunas**:
Colaborador, Terceiro (PJ), Cliente gestor e Cliente membro. O admin vê tudo
sempre e não aparece como coluna.

- **Chave "Em construção"** por módulo: ligada, **só os admins** enxergam o
  módulo, no menu e na API. É assim que um módulo novo vai para produção
  desligado.
- Os perfis de cliente só podem ser marcados nos módulos que um cliente pode
  ter (os mesmos do pacote por empresa de hoje).
- Toda alteração entra na auditoria.

## O que fica de fora da tabela

**Administração** (Empresas, Usuários, E-mail, Classificação, Configuração de
tickets, Auditoria, Satisfação e a própria tela de Acesso por perfil) é
sempre **só admin** e não aparece na tabela: não pode ser desligada nem
liberada por engano.

## Módulos na tabela

Dashboard, Tickets, Pré-tickets, Console/Monitoramento, Agendas (Plantão,
Escala, Manutenção), Mural, Oportunidades, Financeiro, GMUD, Relatórios,
Apontamentos, Inventário, Projetos e Aplicativos.

Passam a obedecer à tabela os módulos que hoje estão fixos no código:
Agendas, Mural, Oportunidades e Pré-tickets (por papel) e **Relatórios**,
cuja permissão por usuário hoje é ignorada: o código só aceita admin.

## Como decide (em ordem)

1. **Em construção?** Só admin passa.
2. **O perfil tem o módulo liberado** na tabela?
3. **Cliente:** o módulo está no pacote da empresa (como hoje)?
4. **Permissão fina da pessoa** (ver, criar, editar, apagar, aprovar), como hoje.

**Vale na API**, não só no menu: rota de módulo desligado responde 403. É a
correção do achado da auditoria (o desligamento por variável de ambiente só
escondia o menu).

A variável `NEXT_PUBLIC_MODULOS_DESABILITADOS` deixa de ser necessária. Os
módulos que ela desliga hoje em produção (Financeiro, Inventário, Projetos e
o bloco de horas de Apontamentos) começam como "Em construção" na migração,
então nada muda para os usuários no dia do deploy.

## Padrão de cada papel

A tabela também define o que um usuário novo de cada papel ganha, hoje fixo
no código (`ROLE_FALLBACK`).

## Fica em código por enquanto

Limites do sistema (fechamento da guia, máximo de guias, prazos de alerta,
nota baixa, bloqueio de login, sessão).

## Limpeza

SLA, Cobrança e Documentação estão na lista de módulos e não são usados.
Somem da tela; o valor no banco fica, porque tirar valor de enum no Postgres é
arriscado e não traz ganho.
