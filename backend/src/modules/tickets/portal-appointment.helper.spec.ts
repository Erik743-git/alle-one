import {
  hhmmDurationMinutes,
  overtimeKindFromServiceName,
  portalAppointmentNumericId,
  serviceNameToValorizationRaw,
} from './portal-appointment.helper';

describe('portal-appointment.helper', () => {
  it('calcula duração HH:MM e cruza meia-noite', () => {
    expect(hhmmDurationMinutes('08:00', '12:00')).toBe(240);
    expect(hhmmDurationMinutes('23:00', '01:00')).toBe(120);
    expect(hhmmDurationMinutes(null, '10:00')).toBe(0);
  });

  it('infere EXTRA/PLANTAO a partir do service_name', () => {
    expect(overtimeKindFromServiceName('HORA EXTRA')).toBe('EXTRA');
    expect(overtimeKindFromServiceName('Plantão Noturno')).toBe('PLANTAO');
    expect(overtimeKindFromServiceName('HORA NORMAL')).toBeNull();
  });

  it('sintetiza valorization_raw compatível', () => {
    expect(serviceNameToValorizationRaw('HORA EXTRA')).toEqual({
      name: 'HORA EXTRA',
    });
  });

  it('usa external id quando presente e hash estável do uuid senão', () => {
    expect(portalAppointmentNumericId(42, 'abc')).toBe(42);
    const a = portalAppointmentNumericId(null, 'uuid-aaaa');
    const b = portalAppointmentNumericId(undefined, 'uuid-aaaa');
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });
});
