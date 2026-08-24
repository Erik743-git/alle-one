import { canonicalizeStageName } from './tickets-stage-groups';
import type {
  TicketAutomationAction,
  TicketAutomationConditions,
  TicketStageChangeContext,
} from './ticket-automation.types';

function normalizeStage(value: string | null | undefined): string {
  if (!value?.trim()) return '';
  return canonicalizeStageName(value.trim()) ?? value.trim();
}

export function matchesAutomationConditions(
  conditions: TicketAutomationConditions,
  ctx: TicketStageChangeContext,
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

export function normalizeAutomationConditions(
  raw: TicketAutomationConditions,
): TicketAutomationConditions {
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
  };
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
      default:
        break;
    }
  }
  return actions;
}

export function hasAnyAutomationCondition(
  conditions: TicketAutomationConditions,
): boolean {
  return Boolean(
    conditions.deskExternalId != null ||
    conditions.clientExternalId != null ||
    conditions.classificationId ||
    conditions.stageOnEntry ||
    conditions.stageOnExit,
  );
}
