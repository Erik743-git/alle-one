import {
  canonicalizeStageName,
  resolveTicketStageGroup,
} from './tickets-stage-groups';
import { isDonePortalStage, PORTAL_STAGE } from './portal-ticket-stages';

describe('tickets-stage-groups', () => {
  it('mapeia legado e canônico para grupos', () => {
    expect(resolveTicketStageGroup('Pendente')).toBe('novo');
    expect(resolveTicketStageGroup('Novo')).toBe('novo');
    expect(resolveTicketStageGroup('Em execução')).toBe('atendimento');
    expect(resolveTicketStageGroup('Em Atendimento')).toBe('atendimento');
    expect(resolveTicketStageGroup('Aguardando Cliente')).toBe('aguardando');
    expect(resolveTicketStageGroup('Resolvido')).toBe('resolvido');
    expect(resolveTicketStageGroup('Encerrado')).toBe('encerrado');
    expect(resolveTicketStageGroup('Cancelado')).toBe('encerrado');
  });

  it('unifica casing legado', () => {
    expect(resolveTicketStageGroup('Em Execução')).toBe('atendimento');
    expect(canonicalizeStageName('Em Execução')).toBe(
      PORTAL_STAGE.EM_ATENDIMENTO,
    );
  });

  it('aceita aliases EN', () => {
    expect(resolveTicketStageGroup('Pending')).toBe('novo');
    expect(resolveTicketStageGroup('In progress')).toBe('atendimento');
  });

  it('tolera UTF-8 corrompido em execução', () => {
    expect(resolveTicketStageGroup('Em execu??o')).toBe('atendimento');
  });

  it('marca resolvido/encerrado/cancelado como done', () => {
    expect(isDonePortalStage('Resolvido')).toBe(true);
    expect(isDonePortalStage('Encerrado')).toBe(true);
    expect(isDonePortalStage('Cancelado')).toBe(true);
    expect(isDonePortalStage('Novo')).toBe(false);
  });
});
