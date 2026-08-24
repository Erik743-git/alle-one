import { canonicalizeStageName } from './tickets-stage-groups';
import type {
  TicketAutomationAction,
  TicketAutomationConditions,
  TicketAutomationSetFieldName,
  TicketAutomationTicketContext,
  TicketAutomationTrigger,
  TicketStageChangeContext,
} from './ticket-automation.types';

function normalizeStage(value: string | null | undefined): string {
  if (!value?.trim()) return '';
  return canonicalizeStageName(value.trim()) ?? value.trim();
}

function matchesCommonFilters(
  conditions: TicketAutomationConditions,
  ctx: TicketAutomationTicketContext,
): boolean {
  if (
    conditions.deskExternalId != null &&
    Number(conditions.deskExternalId) !== Number(ctx.deskExternalId ?? NaN)
  ) {
    return false;
  }

  if (
    conditions.clientExternalId != null &&
    Number(conditions.clientExternalId) !== Number(ctx.clientExternalId ?? NaN)
  ) {
    return false;
  }

  if (
    conditions.classificationId?.trim() &&
    conditions.classificationId !== (ctx.classificationId ?? '')
  ) {
    return false;
  }

  return true;
}

export function matchesStageChangeConditions(
  conditions: TicketAutomationConditions,
  ctx: TicketStageChangeContext,
): boolean {
  if (!matchesCommonFilters(conditions, ctx)) {
    return false;
  }

  const stageOnEntry = conditions.stageOnEntry?.trim() ?? '';
  const stageOnExit = conditions.stageOnExit?.trim() ?? '';
  if (stageOnEntry || stageOnExit) {
    const entryMatch =
      stageOnEntry &&
      normalizeStage(ctx.toStageName) === normalizeStage(stageOnEntry);
    const exitMatch =
      stageOnExit &&
      normalizeStage(ctx.fromStageName) === normalizeStage(stageOnExit);

    if (stageOnEntry && stageOnExit) {
      if (!entryMatch && !exitMatch) return false;
    } else if (stageOnEntry && !entryMatch) {
      return false;
    } else if (stageOnExit && !exitMatch) {
      return false;
    }
  }

  return true;
}

export function matchesTicketContextConditions(
  conditions: TicketAutomationConditions,
  ctx: TicketAutomationTicketContext,
): boolean {
  if (!matchesCommonFilters(conditions, ctx)) {
    return false;
  }

  const idleStageName = conditions.idleStageName?.trim() ?? '';
  if (idleStageName) {
    if (normalizeStage(ctx.stageName) !== normalizeStage(idleStageName)) {
      return false;
    }
  }

  return true;
}

export function matchesAutomationConditions(
  trigger: TicketAutomationTrigger,
  conditions: TicketAutomationConditions,
  ctx: TicketAutomationTicketContext,
): boolean {
  if (trigger === 'STAGE_CHANGE') {
    return matchesStageChangeConditions(
      conditions,
      ctx as TicketStageChangeContext,
    );
  }
  return matchesTicketContextConditions(conditions, ctx);
}

export function normalizeAutomationConditions(
  raw: TicketAutomationConditions,
): TicketAutomationConditions {
  const idleMinutesRaw = Number(raw.idleMinutes);
  return {
    deskExternalId:
      raw.deskExternalId != null && Number.isFinite(Number(raw.deskExternalId))
        ? Number(raw.deskExternalId)
        : null,
    clientExternalId:
      raw.clientExternalId != null &&
      Number.isFinite(Number(raw.clientExternalId))
        ? Number(raw.clientExternalId)
        : null,
    classificationId: raw.classificationId?.trim() || null,
    stageOnEntry: raw.stageOnEntry?.trim() || null,
    stageOnExit: raw.stageOnExit?.trim() || null,
    idleMinutes:
      Number.isFinite(idleMinutesRaw) && idleMinutesRaw > 0
        ? Math.floor(idleMinutesRaw)
        : null,
    idleStageName: raw.idleStageName?.trim() || null,
  };
}

const SET_FIELD_NAMES: TicketAutomationSetFieldName[] = [
  'title',
  'stageName',
  'statusName',
  'isClosed',
  'clientId',
  'deskId',
  'responsibleId',
];

function parseSetFieldValue(
  field: TicketAutomationSetFieldName,
  raw: unknown,
): string | number | boolean | null {
  if (field === 'isClosed') {
    if (typeof raw === 'boolean') return raw;
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    return null;
  }
  if (field === 'clientId' || field === 'deskId' || field === 'responsibleId') {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return null;
}

export function normalizeAutomationActions(
  raw: TicketAutomationAction[],
): TicketAutomationAction[] {
  const actions: TicketAutomationAction[] = [];
  for (const item of raw ?? []) {
    if (!item || typeof item !== 'object' || !('type' in item)) continue;
    switch (item.type) {
      case 'SET_STAGE': {
        const stageName =
          typeof item.stageName === 'string' ? item.stageName.trim() : '';
        if (stageName) actions.push({ type: 'SET_STAGE', stageName });
        break;
      }
      case 'SET_RESPONSIBLE': {
        const id = Number(item.responsibleExternalId);
        if (Number.isFinite(id) && id > 0) {
          actions.push({ type: 'SET_RESPONSIBLE', responsibleExternalId: id });
        }
        break;
      }
      case 'ADD_APPOINTMENT': {
        const description =
          typeof item.description === 'string' ? item.description.trim() : '';
        if (description) {
          actions.push({
            type: 'ADD_APPOINTMENT',
            description,
            notifyClient: Boolean(item.notifyClient),
          });
        }
        break;
      }
      case 'SET_FIELD': {
        const field = SET_FIELD_NAMES.includes(item.field) ? item.field : null;
        if (!field) break;
        const value = parseSetFieldValue(field, item.value);
        if (value === null) break;
        actions.push({ type: 'SET_FIELD', field, value });
        break;
      }
      case 'SEND_EMAIL': {
        const subject =
          typeof item.subject === 'string' ? item.subject.trim() : '';
        const body = typeof item.body === 'string' ? item.body.trim() : '';
        const recipient = item.recipient;
        if (
          !subject ||
          !body ||
          !['REQUESTOR', 'RESPONSIBLE', 'WATCHERS', 'CUSTOM'].includes(
            String(recipient),
          )
        ) {
          break;
        }
        actions.push({
          type: 'SEND_EMAIL',
          recipient: recipient,
          customTo:
            typeof item.customTo === 'string' ? item.customTo.trim() : null,
          subject,
          body,
        });
        break;
      }
      case 'TRIGGER_WEBHOOK': {
        const url = typeof item.url === 'string' ? item.url.trim() : '';
        if (!url.startsWith('http://') && !url.startsWith('https://')) break;
        actions.push({
          type: 'TRIGGER_WEBHOOK',
          url,
          secret:
            typeof item.secret === 'string' ? item.secret.trim() || null : null,
        });
        break;
      }
      default:
        break;
    }
  }
  return actions;
}

export function hasAnyAutomationCondition(
  trigger: TicketAutomationTrigger,
  conditions: TicketAutomationConditions,
): boolean {
  const common = Boolean(
    conditions.deskExternalId != null ||
    conditions.clientExternalId != null ||
    conditions.classificationId ||
    conditions.idleStageName,
  );

  if (trigger === 'STAGE_CHANGE') {
    return Boolean(common || conditions.stageOnEntry || conditions.stageOnExit);
  }

  if (trigger === 'TICKET_IDLE') {
    return Boolean(
      conditions.idleMinutes != null && conditions.idleMinutes > 0,
    );
  }

  return common;
}

export function renderAutomationTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    if (value == null) return '';
    return String(value);
  });
}

/** Resumo legível das ações para o histórico do ticket. */
export function summarizeAutomationActions(
  actions: TicketAutomationAction[],
): string {
  const parts = actions.map((action) => {
    switch (action.type) {
      case 'SET_STAGE':
        return `alterou estágio para "${action.stageName}"`;
      case 'SET_RESPONSIBLE':
        return 'definiu responsável';
      case 'ADD_APPOINTMENT':
        return 'registrou apontamento';
      case 'SET_FIELD':
        return `alterou ${action.field}`;
      case 'SEND_EMAIL':
        return 'enviou e-mail';
      case 'TRIGGER_WEBHOOK':
        return 'disparou webhook';
      default:
        return 'executou ação';
    }
  });
  return parts.length > 0 ? parts.join(', ') : 'executou ações configuradas';
}
