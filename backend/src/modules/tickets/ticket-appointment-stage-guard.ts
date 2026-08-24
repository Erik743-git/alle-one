import { BadRequestException } from '@nestjs/common';
import { resolveTicketStageGroup } from './tickets-stage-groups';

export const TICKET_APPOINTMENT_NOT_STARTED_MESSAGE =
  'Não é possível apontar em chamado não iniciado. Altere o estágio para Em execução.';

export function isNocSpecialtyName(name: string | null | undefined): boolean {
  const normalized = String(name ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return normalized.includes('noc');
}

export function isTicketNotStartedStage(
  stageName: string | null | undefined,
): boolean {
  return resolveTicketStageGroup(stageName) === 'novo';
}

export function assertCanAppointmentOnNotStartedTicket(params: {
  stageName: string | null | undefined;
  userSpecialtyName: string | null | undefined;
}): void {
  if (!isTicketNotStartedStage(params.stageName)) {
    return;
  }
  if (isNocSpecialtyName(params.userSpecialtyName)) {
    return;
  }
  throw new BadRequestException(TICKET_APPOINTMENT_NOT_STARTED_MESSAGE);
}
