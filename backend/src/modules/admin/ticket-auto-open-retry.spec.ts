import { TicketAutoOpenService } from './ticket-auto-open.service';

/**
 * Falha de rotina não pode custar o chamado do dia.
 *
 * Antes, a regra que falhava tinha a data avançada para a próxima ocorrência:
 * o chamado daquele dia nunca era aberto e ninguém percebia, porque no dia
 * seguinte a rotina voltava a funcionar. Agora a mesma ocorrência é tentada de
 * novo, com intervalo crescente, e a data só anda quando o chamado nasce.
 */
describe('TicketAutoOpenService — falha não pula a ocorrência', () => {
  const DIA = new Date('2026-09-18T00:00:00.000Z');

  function regra(over: Record<string, unknown> = {}) {
    return {
      id: 'r1',
      name: 'Validação Backup',
      active: true,
      periodicity: 'DAILY',
      nextScheduledDate: DIA,
      scheduleTime: '08:00',
      deskExternalId: 1,
      clientExternalId: 2,
      responsibleExternalId: null,
      priorityExternalId: null,
      servicesCatalogsItemId: null,
      classificationId: null,
      title: 'titulo',
      description: '', // vazia: faz a abertura falhar
      requestorName: 'Fulano',
      requestorEmail: 'fulano@cliente.com',
      requestorTelephone: null,
      requestorExternalId: null,
      externalGmudRef: null,
      ccEmails: [],
      parentTicketNumber: null,
      consecutiveFailures: 0,
      retryAt: null,
      createdBy: 'u1',
      _count: { attachments: 0 },
      ...over,
    };
  }

  function criarServico(
    rules: ReturnType<typeof regra>[],
    preTicketExistente: { id: string } | null = null,
  ) {
    const update = jest.fn().mockResolvedValue({});
    const sendMail = jest.fn().mockResolvedValue(true);
    const preTicketCreate = jest.fn().mockResolvedValue({});
    const prisma = {
      ticketAutoOpenRule: {
        findMany: jest.fn().mockResolvedValue(rules),
        update,
        findUnique: jest.fn().mockResolvedValue({ creator: null }),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ email: 'admin@alle.com' }]) },
      preTicket: {
        findUnique: jest.fn().mockResolvedValue(preTicketExistente),
        create: preTicketCreate,
      },
      company: { findFirst: jest.fn().mockResolvedValue({ id: 'empresa-1' }) },
      specialty: { findFirst: jest.fn().mockResolvedValue({ id: 'mesa-1' }) },
    };
    const service = new TicketAutoOpenService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { sendMail } as never,
    );
    return { service, update, sendMail, preTicketCreate };
  }

  it('primeira falha mantém a data e agenda nova tentativa', async () => {
    const { service, update } = criarServico([regra()]);

    const res = await service.processDueRules(10);

    expect(res.errors).toBe(1);
    const data = update.mock.calls[0][0].data;
    // O que importa: a ocorrência do dia continua de pé.
    expect(data.nextScheduledDate).toBeUndefined();
    expect(data.retryAt).toBeInstanceOf(Date);
    expect(data.consecutiveFailures).toBe(1);
    expect(data.active).toBeUndefined();
  });

  it('a falha entra na fila de pré-tickets, com empresa e mesa da regra', async () => {
    const { service, preTicketCreate } = criarServico([regra()]);

    await service.processDueRules(10);

    expect(preTicketCreate).toHaveBeenCalledTimes(1);
    const data = preTicketCreate.mock.calls[0][0].data;
    expect(data.title).toContain('Validação Backup');
    expect(data.companyId).toBe('empresa-1');
    expect(data.specialtyId).toBe('mesa-1');
    // O id carrega regra + dia: a segunda tentativa não abre outro aviso.
    expect(data.messageId).toBe('rotina-falha-r1-2026-09-18');
  });

  it('não abre um segundo aviso para a mesma ocorrência', async () => {
    const { service, preTicketCreate } = criarServico(
      [regra({ consecutiveFailures: 1 })],
      { id: 'pre-1' },
    );

    await service.processDueRules(10);

    expect(preTicketCreate).not.toHaveBeenCalled();
  });

  it('regra em espera não é tentada de novo antes da hora', async () => {
    const daquiUmaHora = new Date(Date.now() + 60 * 60 * 1000);
    const { service, update } = criarServico([
      regra({ consecutiveFailures: 1, retryAt: daquiUmaHora }),
    ]);

    const res = await service.processDueRules(10);

    expect(res.errors).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it('na última tentativa desativa a regra e avisa os administradores', async () => {
    const { service, update, sendMail } = criarServico([
      regra({ consecutiveFailures: 4 }),
    ]);

    await service.processDueRules(10);

    const data = update.mock.calls[0][0].data;
    expect(data.active).toBe(false);
    expect(data.retryAt).toBeNull();
    // A data fica parada na ocorrência que falhou: reativar retoma dali.
    expect(data.nextScheduledDate).toBeUndefined();
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toEqual(['admin@alle.com']);
  });
});
