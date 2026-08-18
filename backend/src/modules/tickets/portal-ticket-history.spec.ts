import { appointmentHistoryLabel, formatYmdBr } from './portal-ticket-history';

describe('portal-ticket-history', () => {
  it('formata data YYYY-MM-DD para DD/MM/YYYY', () => {
    expect(formatYmdBr('2026-08-15')).toBe('15/08/2026');
    expect(formatYmdBr(null)).toBe('—');
  });

  it('monta rótulo de apontamento para o histórico', () => {
    expect(
      appointmentHistoryLabel({
        date: '2026-08-15',
        initTime: '23:00',
        endTime: '08:00',
      }),
    ).toBe('15/08/2026 23:00–08:00');
  });
});
