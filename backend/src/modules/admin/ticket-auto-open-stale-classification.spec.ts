import { TicketAutoOpenService } from './ticket-auto-open.service';

/**
 * Classificação que deixou de ser folha.
 *
 * Uma regra guarda o classificationId que era o nível mais específico quando
 * foi salva. Criar uma subclassificação embaixo dele faz a validação de
 * abertura recusar a regra — e isso só aparecia na próxima execução do cron,
 * como falha silenciosa. `list()` marca o caso para a tela avisar antes.
 */
describe('TicketAutoOpenService — classificação que deixou de ser folha', () => {
  function criarServico(filhos: { parentId: string | null }[]) {
    const prisma = {
      ticketAutoOpenRule: { findMany: jest.fn() },
      specialtyClassification: {
        findMany: jest.fn().mockResolvedValue(filhos),
      },
    };
    const service = new TicketAutoOpenService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, prisma };
  }

  function regra(id: string, classificationId: string | null) {
    return {
      id,
      name: `Regra ${id}`,
      active: true,
      periodicity: 'MONTHLY',
      nextScheduledDate: new Date('2026-09-10T00:00:00.000Z'),
      scheduleTime: '08:00',
      deskExternalId: 1,
      clientExternalId: 2,
      responsibleExternalId: null,
      priorityExternalId: null,
      servicesCatalogsItemId: null,
      classificationId,
      title: 'titulo',
      description: 'descricao',
      requestorName: 'Fulano',
      requestorEmail: 'fulano@alle.com',
      requestorTelephone: null,
      requestorExternalId: null,
      externalGmudRef: null,
      ccEmails: [],
      parentTicketNumber: null,
      lastRunAt: null,
      lastTicketNumber: null,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      lastError: null,
      lastErrorAt: null,
      consecutiveFailures: 0,
      attachments: [],
    };
  }

  it('marca a regra cuja classificação ganhou filhos', async () => {
    const { service, prisma } = criarServico([{ parentId: 'classe-pai' }]);
    prisma.ticketAutoOpenRule.findMany.mockResolvedValue([
      regra('r1', 'classe-pai'),
      regra('r2', 'classe-folha'),
    ]);

    const rules = await service.list();

    expect(rules.find((r) => r.id === 'r1')?.classificationStale).toBe(true);
    expect(rules.find((r) => r.id === 'r2')?.classificationStale).toBe(false);
  });

  it('não marca nada quando nenhuma classificação tem filhos', async () => {
    const { service, prisma } = criarServico([]);
    prisma.ticketAutoOpenRule.findMany.mockResolvedValue([
      regra('r1', 'classe-folha'),
    ]);

    const rules = await service.list();

    expect(rules[0].classificationStale).toBe(false);
  });

  it('regra sem classificação não é marcada nem consultada', async () => {
    const { service, prisma } = criarServico([]);
    prisma.ticketAutoOpenRule.findMany.mockResolvedValue([regra('r1', null)]);

    const rules = await service.list();

    expect(rules[0].classificationStale).toBe(false);
    expect(prisma.specialtyClassification.findMany).not.toHaveBeenCalled();
  });
});
