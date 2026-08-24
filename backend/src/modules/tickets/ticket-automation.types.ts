export type TicketAutomationTrigger = 'STAGE_CHANGE';

export type TicketAutomationConditions = {
  deskExternalId?: number | null;
  clientExternalId?: number | null;
  classificationId?: string | null;
  /** Estágio de destino (entrada). */
  stageOnEntry?: string | null;
  /** Estágio de origem (saída). */
  stageOnExit?: string | null;
};

export type TicketAutomationAction =
  | { type: 'SET_STAGE'; stageName: string }
  | { type: 'SET_RESPONSIBLE'; responsibleExternalId: number }
  | {
      type: 'ADD_APPOINTMENT';
      description: string;
      notifyClient?: boolean;
    };

export type TicketStageChangeContext = {
  ticketNumber: number;
  fromStageName: string | null;
  toStageName: string;
  stageId: number;
  deskExternalId: number | null;
  clientExternalId: number | null;
  classificationId: string | null;
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
};

export const TICKET_AUTOMATION_ACTION_LABELS: Record<
  TicketAutomationAction['type'],
  string
> = {
  SET_STAGE: 'Alterar estágio',
  SET_RESPONSIBLE: 'Definir responsável',
  ADD_APPOINTMENT: 'Registrar apontamento',
};
