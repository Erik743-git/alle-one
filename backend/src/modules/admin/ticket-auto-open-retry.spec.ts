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

  function criarServico(rules: ReturnType<typeof regra>[]) {
    const update = jest.fn().mockResolvedValue({});
    const sendMail = jest.fn().mockResolvedValue(true);
    const prisma = {
      ticketAutoOpenRule: {
        findMany: jest.fn().mockResolvedValue(rules),
        update,
        findUnique: jest.fn().mockResolvedValue({ creator: null }),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ email: 'admin@alle.com' }]) },
    };
    const service = new TicketAutoOpenService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { sendMail } as never,
    );
    return { service, update, sendMail };
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
