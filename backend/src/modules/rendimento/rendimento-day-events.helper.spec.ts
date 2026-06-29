import {
  buildDayEventSourceKey,
  dayEventStatusPriority,
  isProtectedOvertimeDecisionStatus,
} from './rendimento-day-events.helper';

describe('rendimento-day-events.helper', () => {
  describe('buildDayEventSourceKey', () => {
    it('deriva chave distinta quando horario do apontamento muda', () => {
      const base = {
        eventType: 'OVERTIME' as const,
        dateRef: '2026-06-02',
        appointmentExternalId: 22735732,
      };
      const before = buildDayEventSourceKey({
        ...base,
        fromTime: '18:00',
        toTime: '23:00',
      });
      const after = buildDayEventSourceKey({
        ...base,
        fromTime: '18:00',
        toTime: '23:59',
      });
      expect(before).not.toBe(after);
      expect(before).toBe('OVERTIME|2026-06-02|18:00|23:00|22735732|');
      expect(after).toBe('OVERTIME|2026-06-02|18:00|23:59|22735732|');
    });
  });

  describe('isProtectedOvertimeDecisionStatus', () => {
    it('protege APPROVED e REJECTED do reconcile', () => {
      expect(isProtectedOvertimeDecisionStatus('APPROVED')).toBe(true);
      expect(isProtectedOvertimeDecisionStatus('REJECTED')).toBe(true);
      expect(isProtectedOvertimeDecisionStatus('PENDING')).toBe(false);
      expect(isProtectedOvertimeDecisionStatus('ACTIVE')).toBe(false);
    });
  });

  describe('dayEventStatusPriority', () => {
    it('prioriza APPROVED sobre PENDING ao anexar evento ao apontamento', () => {
      expect(dayEventStatusPriority('APPROVED')).toBeLessThan(
        dayEventStatusPriority('PENDING'),
      );
      expect(dayEventStatusPriority('REJECTED')).toBeLessThan(
        dayEventStatusPriority('PENDING'),
      );
    });
  });
});
