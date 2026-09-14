import { TicketAutomationService } from './ticket-automation.service';

/**
 * Regra "ao entrar em Novo" precisa rodar quando o chamado já nasce em Novo.
 * Antes só rodava numa mudança de estágio, que a criação nunca dispara.
 */
describe('TicketAutomationService — entrada no estágio na criação', () => {
  const actor = { userId: 'u1', role: 'ADMIN' } as never;

  function montar(regras: Array<Record<string, unknown>>) {
    const updateTicket = jest.fn().mockResolvedValue({});
    const prisma = {
      portalTicket: {
        findUnique: jest.fn().mockResolvedValue({
          ticketNumber: 76952,
          deskExternalId: 43731,
          clientExternalId: 1893278,
          classificationId: null,
          stageName: 'Novo',
        }),
      },
      ticketAutomationRule: {
        findMany: jest.fn(({ where }: { where: { trigger: string } }) =>
          Promise.resolve(regras.filter((r) => r.trigger === where.trigger)),
        ),
      },
      ticketAutomationRun: { create: jest.fn().mockResolvedValue({}) },
      ticketHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new TicketAutomationService(
      prisma as never,
      { updateTicket } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, prisma, updateTicket };
  }

  const regra = (conditions: Record<string, unknown>, id = 'r1') => ({
    id,
    name: id,
    active: true,
    trigger: 'STAGE_CHANGE',
    sortOrder: 0,
    createdAt: new Date(),
    conditions: {
      idleMinutes: null,
      stageOnExit: null,
      idleStageName: null,
      classificationId: null,
      ...conditions,
    },
    actions: [{ type: 'SET_FIELD', field: 'responsibleId', value: 1027536 }],
  });

  it('roda regra de entrada em Novo ao abrir o chamado', async () => {
    const { service, prisma } = montar([
      regra({
        stageOnEntry: 'Novo',
        deskExternalId: 43731,
        clientExternalId: 1893278,
      }),
    ]);
    await service.handleTicketOpened(actor, 76952);
    expect(prisma.ticketAutomationRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ruleId: 'r1', ticketNumber: 76952 }),
      }),
    );
  });

  it('não roda se a mesa da regra for outra', async () => {
    const { service, prisma } = montar([
      regra({
        stageOnEntry: 'Novo',
        deskExternalId: 69758,
        clientExternalId: 1893278,
      }),
    ]);
    await service.handleTicketOpened(actor, 76952);
    expect(prisma.ticketAutomationRun.create).not.toHaveBeenCalled();
  });

  it('não roda regra sem stageOnEntry (qualquer mudança ou só saída)', async () => {
    const { service, prisma } = montar([
      regra({ stageOnEntry: null }, 'qualquer'),
      regra({ stageOnEntry: null, stageOnExit: 'Novo' }, 'saida'),
    ]);
    await service.handleTicketOpened(actor, 76952);
    expect(prisma.ticketAutomationRun.create).not.toHaveBeenCalled();
  });
});
