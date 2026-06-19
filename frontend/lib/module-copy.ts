/**
 * Textos de interface — linguagem neutra para clientes e colaboradores.
 * Evitar jargão técnico, tom acusatório ou detalhes de implementação.
 */

export const TICKETS_NEW_SUBTITLE =
  "Informe os dados do chamado. Após o envio, ele ficará disponível na lista de tickets.";

export const TICKETS_LIST_SUBTITLE =
  "Por padrão, são exibidos os chamados em que você é o responsável.";

export const TICKETS_CREATE_RESTRICTED =
  "A abertura de novos chamados é feita pela equipe administrativa. Você pode consultar os chamados existentes.";

export const TICKETS_APPOINTMENT_CREATE_RESTRICTED =
  "Você não tem permissão para registrar apontamentos neste módulo. Consulte os chamados existentes ou fale com o administrador.";

export const APONTAMENTOS_ADMIN_SUBTITLE =
  "Consulte a agenda e as horas registradas de cada colaborador.";

export const APONTAMENTOS_AGENDA_SUBTITLE =
  "Registros de horas vinculados aos chamados de atendimento.";

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

export const RENDIMENTO_JUSTIFICATION_ALERT_DESC =
  "Descreva o motivo do intervalo. Após análise da equipe administrativa, o registro será confirmado.";

export const RENDIMENTO_JUSTIFICATION_VOLUNTARY_DESC =
  "Registre um intervalo pontual (ex.: consulta médica) para análise da equipe administrativa.";

export const RENDIMENTO_DEFINE_LUNCH_HINT =
  "Marque se este intervalo corresponde ao horário de almoço.";

export const RENDIMENTO_DEBIT_OVERTIME_LABEL = "Ajustar saldo de horas extras";

export const RENDIMENTO_OVERTIME_BALANCE_LABEL = "Saldo de horas extras";

export const RENDIMENTO_GAP_LEGEND =
  "Mais de 1 hora sem registro de horas";

export const RENDIMENTO_LUNCH_LEGEND =
  "Intervalo de almoço (até um por dia)";

export const RENDIMENTO_OVERTIME_APPROVED_NOTE =
  "Aprovado · registrado no saldo";

export const RENDIMENTO_OVERTIME_REJECTED_NOTE =
  "Não aprovado · não entra no saldo";

export const SYNC_STATUS_PORTAL_ONLY = "Registrado no portal";

export const SYNC_STATUS_PENDING = "Em sincronização";

/** Correio / notificações */
export const MAILBOX_RENDIMENTO_ALERT_BODY_ONE = (dateLabel: string, monthLabel: string) =>
  `Há um intervalo sem registro de horas em ${dateLabel} (${monthLabel}). Confira sua agenda.`;

export const MAILBOX_RENDIMENTO_ALERT_BODY_MANY = (count: number, monthLabel: string) =>
  `Há ${count} dia(s) com intervalo sem registro de horas em ${monthLabel}. Confira sua agenda.`;

export const MAILBOX_TICKET_NO_HOURS_TITLE = "Chamado sem registro de horas (24h+)";

export const MAILBOX_TICKET_NO_HOURS_BODY = (
  ticketNumber: number,
  title: string | null,
) =>
  `Chamado #${ticketNumber}${title ? ` — ${title}` : ""}: aberto há mais de 24h sem registro de horas.`;

export const MAILBOX_TICKET_STALLED_48H_BODY = (
  ticketNumber: number,
  title: string | null,
) =>
  `Chamado #${ticketNumber}${title ? ` — ${title}` : ""}: sem atualização há mais de 48 horas.`;

export const MAILBOX_TICKET_STALLED_7D_BODY = (
  ticketNumber: number,
  title: string | null,
) =>
  `Chamado #${ticketNumber}${title ? ` — ${title}` : ""}: sem atualização há mais de 7 dias.`;

export const MAILBOX_JUSTIFICATION_PENDING_BODY = (
  userName: string,
  date: string,
  from: string,
  to: string,
) =>
  `${userName} · ${date} (${from}–${to}) — justificativa aguardando análise.`;

export const CORREIO_FOOTER_TICKETS =
  "Colaboradores recebem aviso quando um chamado próprio está aberto há 24h+ sem registro de horas; administradores recebem alertas de chamados sem atualização há 48h ou 7 dias.";

export const MAILBOX_RENDIMENTO_ALERT_FILTER_DESC =
  "Intervalos sem registro de horas na sua agenda do mês.";

export const MAILBOX_RENDIMENTO_APPROVAL_FILTER_DESC =
  "Justificativas de colaboradores aguardando análise.";
