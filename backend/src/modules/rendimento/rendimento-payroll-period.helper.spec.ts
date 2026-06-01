import { resolvePayrollPeriodRange } from './rendimento-payroll-period.helper';

describe('resolvePayrollPeriodRange', () => {
  it('dia >= 25: período começa no dia 25 do mês atual', () => {
    const range = resolvePayrollPeriodRange(new Date('2026-05-28T12:00:00'));
    expect(range.startIso).toBe('2026-05-25');
    expect(range.endIso).toBe('2026-06-24');
  });

  it('dia < 25: período começa no dia 25 do mês anterior', () => {
    const range = resolvePayrollPeriodRange(new Date('2026-05-10T12:00:00'));
    expect(range.startIso).toBe('2026-04-25');
    expect(range.endIso).toBe('2026-05-24');
  });

  it('no dia 25 inicia novo período', () => {
    const range = resolvePayrollPeriodRange(new Date('2026-05-25T12:00:00'));
    expect(range.startIso).toBe('2026-05-25');
    expect(range.endIso).toBe('2026-06-24');
  });
});
