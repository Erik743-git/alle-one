import {
  assertCanAppointmentOnNotStartedTicket,
  isNocSpecialtyName,
  isTicketNotStartedStage,
} from './ticket-appointment-stage-guard';

describe('ticket-appointment-stage-guard', () => {
  it('identifica estágio não iniciado', () => {
    expect(isTicketNotStartedStage('Novo')).toBe(true);
    expect(isTicketNotStartedStage('Pendente')).toBe(true);
    expect(isTicketNotStartedStage('Em execução')).toBe(false);
    expect(isTicketNotStartedStage('Em Atendimento')).toBe(false);
  });

  it('identifica especialidade NOC', () => {
    expect(isNocSpecialtyName('NOC')).toBe(true);
    expect(isNocSpecialtyName('Mesa NOC')).toBe(true);
    expect(isNocSpecialtyName('Sistema')).toBe(false);
    expect(isNocSpecialtyName(null)).toBe(false);
  });

  it('permite apontamento em novo só para NOC', () => {
    expect(() =>
      assertCanAppointmentOnNotStartedTicket({
        stageName: 'Novo',
        userSpecialtyName: 'NOC',
      }),
    ).not.toThrow();

    expect(() =>
      assertCanAppointmentOnNotStartedTicket({
        stageName: 'Novo',
        userSpecialtyName: 'Sistema',
      }),
    ).toThrow();

    expect(() =>
      assertCanAppointmentOnNotStartedTicket({
        stageName: 'Em execução',
        userSpecialtyName: 'Sistema',
      }),
    ).not.toThrow();
  });
});
