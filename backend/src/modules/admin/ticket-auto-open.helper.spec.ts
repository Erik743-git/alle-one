import { TicketAutoOpenPeriodicity } from '@prisma/client';
import {
  advanceScheduledDate,
  formatYmdUtc,
  normalizeAutoOpenResponsibleStorage,
  normalizeAutoOpenResponsibleFromDb,
  normalizeScheduleTime,
  parseRuleDueAt,
  parseYmdToUtcDate,
  resolveAutoOpenResponsibleId,
  TICKET_AUTO_OPEN_AUTO_RESPONSIBLE,
  TICKET_AUTO_OPEN_PRE_TICKET,
} from './ticket-auto-open.helper';

describe('ticket-auto-open.helper', () => {
  it('parseRuleDueAt usa horário em BRT (-03:00)', () => {
    const due = parseRuleDueAt({
      nextScheduledDate: parseYmdToUtcDate('2026-08-28'),
      scheduleTime: '08:00',
    });
    expect(due.toISOString()).toBe('2026-08-28T11:00:00.000Z');
  });

  it('normalizeScheduleTime aceita HH:MM:SS do input time', () => {
    expect(normalizeScheduleTime('08:30:00')).toBe('08:30');
  });

  it('advanceScheduledDate avança seis meses (SEMIANNUAL)', () => {
    const current = parseYmdToUtcDate('2026-02-28');
    const next = advanceScheduledDate(
      current,
      TicketAutoOpenPeriodicity.SEMIANNUAL,
    );
    expect(formatYmdUtc(next)).toBe('2026-08-28');
  });

  it('advanceScheduledDate avança um ano (YEARLY)', () => {
    const current = parseYmdToUtcDate('2026-02-28');
    const next = advanceScheduledDate(
      current,
      TicketAutoOpenPeriodicity.YEARLY,
    );
    expect(formatYmdUtc(next)).toBe('2027-02-28');
  });

  it('resolveAutoOpenResponsibleId distingue automático, pré-ticket e explícito', () => {
    expect(
      resolveAutoOpenResponsibleId(TICKET_AUTO_OPEN_AUTO_RESPONSIBLE),
    ).toBe(undefined);
    expect(
      resolveAutoOpenResponsibleId(TICKET_AUTO_OPEN_PRE_TICKET),
    ).toBeNull();
    expect(resolveAutoOpenResponsibleId(42)).toBe(42);
  });

  it('normalizeAutoOpenResponsibleStorage persiste modos de responsável', () => {
    expect(normalizeAutoOpenResponsibleStorage(undefined)).toBe(
      TICKET_AUTO_OPEN_AUTO_RESPONSIBLE,
    );
    expect(
      normalizeAutoOpenResponsibleStorage(TICKET_AUTO_OPEN_PRE_TICKET),
    ).toBe(TICKET_AUTO_OPEN_PRE_TICKET);
    expect(normalizeAutoOpenResponsibleStorage(99)).toBe(99);
  });

  it('normalizeAutoOpenResponsibleFromDb trata null legado como pre-ticket', () => {
    expect(normalizeAutoOpenResponsibleFromDb(null)).toBe(
      TICKET_AUTO_OPEN_PRE_TICKET,
    );
    expect(normalizeAutoOpenResponsibleFromDb(0)).toBe(0);
    expect(normalizeAutoOpenResponsibleFromDb(-1)).toBe(-1);
  });
});
