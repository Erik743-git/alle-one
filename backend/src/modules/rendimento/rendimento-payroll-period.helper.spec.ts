import {
  resolvePayrollPeriodRange,
  resolvePayrollPeriodRangeForCalendarMonth,
  resolvePayrollPeriodRangeForTimesheet,
} from './rendimento-payroll-period.helper';

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

describe('resolvePayrollPeriodRangeForCalendarMonth', () => {
  it('em julho (mesmo no dia 29) permanece 26/06 → 25/07', () => {
    const range = resolvePayrollPeriodRangeForCalendarMonth(
      new Date('2026-07-29T12:00:00'),
    );
    expect(range.startIso).toBe('2026-06-26');
    expect(range.endIso).toBe('2026-07-25');
  });

  it('no dia 30 de julho não pula para o período 26/07', () => {
    const range = resolvePayrollPeriodRangeForCalendarMonth(
      new Date('2026-07-30T12:00:00'),
    );
    expect(range.startIso).toBe('2026-06-26');
    expect(range.endIso).toBe('2026-07-25');
  });

  it('em agosto usa 26/07 → 25/08', () => {
    const range = resolvePayrollPeriodRangeForCalendarMonth(
      new Date('2026-08-05T12:00:00'),
    );
    expect(range.startIso).toBe('2026-07-26');
    expect(range.endIso).toBe('2026-08-25');
  });

  it('dia 30/08 no calendário mensal ainda usa 26/07 → 25/08', () => {
    const range = resolvePayrollPeriodRangeForCalendarMonth(
      new Date('2026-08-30T12:00:00'),
    );
    expect(range.startIso).toBe('2026-07-26');
    expect(range.endIso).toBe('2026-08-25');
  });
});

describe('período folha na visão Dia vs Mês', () => {
  it('dia 30/08 na visão Dia pertence ao período 26/08 → 25/09', () => {
    const dayRange = resolvePayrollPeriodRange(new Date('2026-08-30T12:00:00'));
    expect(dayRange.startIso).toBe('2026-08-26');
    expect(dayRange.endIso).toBe('2026-09-25');
  });
});

describe('resolvePayrollPeriodRangeForTimesheet', () => {
  const ref = new Date('2026-08-30T12:00:00');

  it('mês: permanece estável em 26/07 → 25/08', () => {
    const range = resolvePayrollPeriodRangeForTimesheet(ref, 'month');
    expect(range.startIso).toBe('2026-07-26');
    expect(range.endIso).toBe('2026-08-25');
  });

  it('semana: usa o período que contém a data (26/08 → 25/09)', () => {
    const range = resolvePayrollPeriodRangeForTimesheet(ref, 'week');
    expect(range.startIso).toBe('2026-08-26');
    expect(range.endIso).toBe('2026-09-25');
  });

  it('dia: usa o período que contém a data (26/08 → 25/09)', () => {
    const range = resolvePayrollPeriodRangeForTimesheet(ref, 'day');
    expect(range.startIso).toBe('2026-08-26');
    expect(range.endIso).toBe('2026-09-25');
  });
});
