import { summarizeAutomationActions } from './ticket-automation.helper';
import type { TicketAutomationAction } from './ticket-automation.types';

describe('summarizeAutomationActions', () => {
  it('resume ações conhecidas', () => {
    const actions: TicketAutomationAction[] = [
      { type: 'SET_RESPONSIBLE', responsibleExternalId: 42 },
      { type: 'SET_STAGE', stageName: 'Em atendimento' },
    ];
    expect(summarizeAutomationActions(actions)).toBe(
      'definiu responsável, alterou estágio para "Em atendimento"',
    );
  });

  it('retorna fallback quando não há ações', () => {
    expect(summarizeAutomationActions([])).toBe('executou ações configuradas');
  });
});
