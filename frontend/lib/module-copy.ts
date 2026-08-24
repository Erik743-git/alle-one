/**
 * Textos de interface — linguagem neutra para clientes e colaboradores.
 * Evitar jargão técnico, tom acusatório ou detalhes de implementação.
 */

export const TICKETS_NEW_SUBTITLE =
  "Informe os dados do ticket. Após o envio, ele ficará disponível na lista de tickets.";

export const TICKETS_LIST_SUBTITLE =
  "Por padrão, são exibidos os tickets em que você é o responsável.";

export const TICKETS_CLIENT_LIST_SUBTITLE =
  "Tickets da sua empresa. Você também pode abrir tickets para a Alle.";

export const TICKETS_CREATE_RESTRICTED =
  "Você não tem permissão para abrir novos tickets. Consulte os existentes ou fale com o administrador.";

export const TICKETS_APPOINTMENT_CREATE_RESTRICTED =
  "Você não tem permissão para registrar apontamentos neste módulo. Consulte os tickets existentes ou fale com o administrador.";

export const APONTAMENTOS_ADMIN_SUBTITLE =
  "Consulte a agenda e as horas registradas de cada colaborador.";

export const APONTAMENTOS_GESTOR_SUBTITLE =
  "Funcionários da sua empresa. Os apontamentos da equipe Alle ficam em Financeiro.";

export const APONTAMENTOS_AGENDA_SUBTITLE =
  "Registros de horas vinculados aos tickets de atendimento.";

export const APONTAMENTOS_PJ_SUBTITLE =
  "Visão resumida dos seus apontamentos e horas extras.";

export const APONTAMENTOS_MONTH_HOURS_NOTE =
  "Total do mês calculado sem contar horas sobrepostas no mesmo dia.";

export const APONTAMENTOS_LIST_SETTINGS_TITLE =
  "Lista de colaboradores";

export const APONTAMENTOS_LIST_SETTINGS_DESCRIPTION =
  "Escolha quais colaboradores aparecem na lista de Apontamentos. A configuração vale para todos os administradores.";

export const APONTAMENTOS_LIST_SETTINGS_LISTED_LABEL =
  "Listar na tela";

export const FINANCEIRO_CLIENT_AGENDA_TITLE =
  "Atendimento Alle no seu ambiente";

export const FINANCEIRO_CLIENT_AGENDA_SUBTITLE =
  "Horas e apontamentos dos colaboradores Alle na sua empresa. Você pode questionar registros no calendário.";

export const FINANCEIRO_ADMIN_AGENDA_SUBTITLE =
  "Agenda por dia, semana ou mês — mesma visão que o cliente vê no portal. Responda questionamentos e abone apontamentos quando necessário.";

export const DASHBOARD_CLIENT_ALLE_LABEL = "Visão Alle";
export const DASHBOARD_CLIENT_INTERNAL_LABEL = "Visão interna";
export const DASHBOARD_CLIENT_ALLE_HINT =
  "O que a Alle registra no seu ambiente (tickets e horas de atendimento).";
export const DASHBOARD_CLIENT_INTERNAL_HINT =
  "Tickets abertos pelos seus funcionários no portal.";
export const DASHBOARD_EDIT_CHART_LABEL = "Editar gráfico";

export const RENDIMENTO_JUSTIFICATION_ALERT_DESC =
  "Informe o período da lacuna detectada pelo sistema. A descrição é opcional; se deixar em branco, o débito será feito no saldo de horas extras (pode ficar negativo). Para horários em outras faixas do dia, use Justificativa voluntária.";

export const RENDIMENTO_JUSTIFICATION_VOLUNTARY_DESC =
  "Registre um período em que você trabalhou ou esteve ausente sem apontamento em ticket. Escolha livremente data e horário — inclusive se cruzar a meia-noite (ex.: início 23:00, fim 07:00 do dia seguinte).";

export const RENDIMENTO_DEFINE_LUNCH_HINT =
  "Marque se este intervalo corresponde ao horário de almoço.";

export const RENDIMENTO_DEBIT_OVERTIME_LABEL = "Descontar saldo de horas extras";

export const RENDIMENTO_OVERTIME_BALANCE_LABEL = "Saldo de horas extras";

export const RENDIMENTO_GAP_LEGEND =
  "Mais de 1 hora sem registro de horas";

export const RENDIMENTO_LUNCH_LEGEND =
  "Intervalo de almoço (até um por dia)";

export const RENDIMENTO_OVERTIME_APPROVED_NOTE =
  "Aprovado · registrado no saldo";

export const RENDIMENTO_OVERTIME_REJECTED_NOTE =
  "Não aprovado · não entra no saldo";

export const SYNC_STATUS_PORTAL_ONLY = "Registrado no Alle One";

export const SYNC_STATUS_PENDING = "Em sincronização";

export const SYNC_STATUS_PAUSED = "Sincronização pausada";

export const TICKET_APPOINTMENT_TIFLUX_PORTAL_ONLY_WARNING =
  "Este apontamento fica registrado no Alle One.";

export const TICKET_NO_RESPONSIBLE_PRETICKET_WARNING =
  "Sem responsável, o ticket entra na fila de pré-tickets para triagem. Atribua um responsável depois para concluir a abertura. Descrição, anexos e demais dados serão preservados.";

export const TICKET_REMOVE_RESPONSIBLE_PRETICKET_WARNING =
  "Ao remover o responsável, o ticket volta para a fila de pré-tickets aguardando triagem. Nenhuma informação do ticket será apagada.";

export const TICKET_PRETICKET_BANNER =
  "Este ticket está na triagem (pré-ticket). Atribua um responsável para retirá-lo da fila.";

export const TICKET_APPOINTMENT_NOT_STARTED_WARNING =
  "Este ticket ainda não foi iniciado. Para apontar horas, altere o estágio para Em execução.";

export const TICKET_APPOINTMENT_WARNING_HINT =
  "Marque quando o apontamento for uma advertência importante. Quem abrir o ticket verá um aviso para ler o conteúdo antes de continuar.";

export const TICKET_APPOINTMENT_WARNING_DIALOG_INTRO =
  "Este ticket possui advertência(s) que precisam ser lidas. Selecione uma linha para ver o conteúdo completo.";

/** Apontamento listado só pelo espelho externo (sem portalAppointmentId). */
export const TICKET_APPOINTMENT_TIFLUX_ONLY_HINT =
  "Registro histórico migrado — edite quando disponível.";

export const TICKET_APPOINTMENT_EXTERNAL_ONLY_BADGE = "Histórico";
export const TICKET_APPOINTMENT_EXTERNAL_ONLY_ACTION = "Só leitura";

export const TICKET_SYNC_PENDING_BANNER =
  "Ticket recém-criado: ainda pode demorar um instante para aparecer na listagem.";

export const TICKET_DELETE_APPOINTMENT_CONFIRM =
  "O apontamento será removido.";

/** Correio / notificações */
export const MAILBOX_RENDIMENTO_ALERT_BODY_ONE = (dateLabel: string, monthLabel: string) =>
  `Há um intervalo sem registro de horas em ${dateLabel} (${monthLabel}). Confira sua agenda.`;

export const MAILBOX_RENDIMENTO_ALERT_BODY_MANY = (count: number, monthLabel: string) =>
  `Há ${count} dia(s) com intervalo sem registro de horas em ${monthLabel}. Confira sua agenda.`;

export const MAILBOX_TICKET_NO_HOURS_TITLE = "Ticket sem registro de horas (24h+)";

export const MAILBOX_TICKET_NO_HOURS_BODY = (
  ticketNumber: number,
  title: string | null,
) =>
  `Ticket #${ticketNumber}${title ? ` — ${title}` : ""}: aberto há mais de 24h sem registro de horas.`;

export const MAILBOX_TICKET_STALLED_48H_BODY = (
  ticketNumber: number,
  title: string | null,
) =>
  `Ticket #${ticketNumber}${title ? ` — ${title}` : ""}: sem atualização há mais de 48 horas.`;

export const MAILBOX_TICKET_STALLED_7D_BODY = (
  ticketNumber: number,
  title: string | null,
) =>
  `Ticket #${ticketNumber}${title ? ` — ${title}` : ""}: sem atualização há mais de 7 dias.`;

export const MAILBOX_JUSTIFICATION_PENDING_BODY = (
  userName: string,
  date: string,
  from: string,
  to: string,
) =>
  `${userName} · ${date} (${from}–${to}) — justificativa aguardando análise.`;

export const CORREIO_FOOTER_TICKETS =
  "Colaboradores recebem aviso quando um ticket próprio está aberto há 24h+ sem registro de horas; administradores recebem alertas de tickets sem atualização há 48h ou 7 dias.";

export const MAILBOX_RENDIMENTO_ALERT_FILTER_DESC =
  "Intervalos sem registro de horas na sua agenda do mês.";

export const MAILBOX_RENDIMENTO_APPROVAL_FILTER_DESC =
  "Justificativas de colaboradores aguardando análise.";
