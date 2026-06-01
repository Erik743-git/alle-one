import { resolvePayrollPeriodRange } from './rendimento-payroll-period.helper';

describe('resolvePayrollPeriodRange', () => {
  it('dia >= 26: período começa no dia 26 do mês atual', () => {
    const range = resolvePayrollPeriodRange(new Date('2026-05-28T12:00:00'));
    expect(range.startIso).toBe('2026-05-26');
    expect(range.endIso).toBe('2026-06-25');
  });

  it('dia < 26: período começa no dia 26 do mês anterior', () => {
    const range = resolvePayrollPeriodRange(new Date('2026-06-10T12:00:00'));
    expect(range.startIso).toBe('2026-05-26');
    expect(range.endIso).toBe('2026-06-25');
  });

  it('no dia 26 inicia novo período', () => {
    const range = resolvePayrollPeriodRange(new Date('2026-05-26T12:00:00'));
    expect(range.startIso).toBe('2026-05-26');
    expect(range.endIso).toBe('2026-06-25');
  });

  it('no dia 25 ainda está no período anterior', () => {
    const range = resolvePayrollPeriodRange(new Date('2026-06-25T12:00:00'));
    expect(range.startIso).toBe('2026-05-26');
    expect(range.endIso).toBe('2026-06-25');
  });
});
