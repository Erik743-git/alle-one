export type TicketAutomationTrigger =
  | 'STAGE_CHANGE'
  | 'TICKET_OPENED'
  | 'TICKET_IDLE'
  | 'TICKET_NEW_REPLY';

export type TicketAutomationConditions = {
  deskExternalId?: number | null;
  clientExternalId?: number | null;
  classificationId?: string | null;
  /** Estágio de destino (entrada) — gatilho STAGE_CHANGE. */
  stageOnEntry?: string | null;
  /** Estágio de origem (saída) — gatilho STAGE_CHANGE. */
  stageOnExit?: string | null;
  /** Minutos parado no estágio — gatilho TICKET_IDLE. */
  idleMinutes?: number | null;
  /** Estágio atual exigido — gatilho TICKET_IDLE (opcional). */
  idleStageName?: string | null;
};

export type TicketAutomationSetFieldName =
  | 'title'
  | 'stageName'
  | 'statusName'
  | 'isClosed'
  | 'clientId'
  | 'deskId'
  | 'responsibleId';

export type TicketAutomationEmailRecipient =
  | 'REQUESTOR'
  | 'RESPONSIBLE'
  | 'WATCHERS'
  | 'CUSTOM';

export type TicketAutomationAction =
  | { type: 'SET_STAGE'; stageName: string }
  | { type: 'SET_RESPONSIBLE'; responsibleExternalId: number }
  | {
      type: 'ADD_APPOINTMENT';
      description: string;
      notifyClient?: boolean;
    }
  | {
      type: 'SET_FIELD';
      field: TicketAutomationSetFieldName;
      value: string | number | boolean;
    }
  | {
      type: 'SEND_EMAIL';
      recipient: TicketAutomationEmailRecipient;
      customTo?: string | null;
      subject: string;
      body: string;
    }
  | {
      type: 'TRIGGER_WEBHOOK';
      url: string;
      secret?: string | null;
    };

export type TicketAutomationTicketContext = {
  ticketNumber: number;
  deskExternalId: number | null;
  clientExternalId: number | null;
  classificationId: string | null;
  stageName: string | null;
  fromStageName?: string | null;
  toStageName?: string | null;
};

export type TicketStageChangeContext = TicketAutomationTicketContext & {
  stageId: number;
  fromStageName: string | null;
  toStageName: string;
};

export type TicketAutomationRuleDto = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  trigger: TicketAutomationTrigger;
  conditions: TicketAutomationConditions;
  actions: TicketAutomationAction[];
  sortOrder: number;
  createdAt: string;
};

export const TICKET_AUTOMATION_TRIGGER_LABELS: Record<
  TicketAutomationTrigger,
  string
> = {
  STAGE_CHANGE: 'Ticket alterar o estágio',
  TICKET_OPENED: 'Ticket aberto',
  TICKET_IDLE: 'Ticket permanece por um tempo',
  TICKET_NEW_REPLY: 'Nova resposta no ticket',
};

export const TICKET_AUTOMATION_ACTION_LABELS: Record<
  TicketAutomationAction['type'],
  string
> = {
  SET_STAGE: 'Alterar estágio',
  SET_RESPONSIBLE: 'Definir responsável',
  ADD_APPOINTMENT: 'Registrar apontamento',
  SET_FIELD: 'Alterar campo',
  SEND_EMAIL: 'Enviar e-mail',
  TRIGGER_WEBHOOK: 'Disparar webhook',
};

export const TICKET_AUTOMATION_SET_FIELD_LABELS: Record<
  TicketAutomationSetFieldName,
  string
> = {
  title: 'Título',
  stageName: 'Estágio',
  statusName: 'Status',
  isClosed: 'Fechado',
  clientId: 'Cliente',
  deskId: 'Catálogo / mesa',
  responsibleId: 'Responsável',
};

export const TICKET_AUTOMATION_EMAIL_RECIPIENT_LABELS: Record<
  TicketAutomationEmailRecipient,
  string
> = {
  REQUESTOR: 'Solicitante',
  RESPONSIBLE: 'Responsável',
  WATCHERS: 'Seguidores (CC)',
  CUSTOM: 'E-mail personalizado',
};
