import { RendimentoStoreService } from './rendimento-store.service';

describe('RendimentoStoreService', () => {
  const prisma = {
    rendimentoDayEvent: {
      findMany: jest.fn(),
    },
    rendimentoGapJustification: {
      findMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
  } as unknown as ConstructorParameters<typeof RendimentoStoreService>[0];

  const service = new RendimentoStoreService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lista day events via Prisma com mapeamento de horários', async () => {
    (prisma.rendimentoDayEvent.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'evt-1',
        userId: 'u1',
        dateRef: new Date('2026-06-02T00:00:00.000Z'),
        eventType: 'LUNCH',
        fromTime: new Date('1970-01-01T12:00:00.000Z'),
        toTime: new Date('1970-01-01T13:00:00.000Z'),
        minutes: 60,
        appointmentExternalId: null,
        justificationId: null,
        label: 'Almoço',
        description: null,
        reason: null,
        status: 'ACTIVE',
        debitProtected: false,
        sourceKey: 'lunch:2026-06-02',
      },
    ]);

    const rows = await service.listDayEvents({
      userId: 'u1',
      start: new Date('2026-06-01T00:00:00.000Z'),
      end: new Date('2026-06-30T00:00:00.000Z'),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'evt-1',
      user_id: 'u1',
      date_ref: '2026-06-02',
      from_time: '12:00',
      to_time: '13:00',
      event_type: 'LUNCH',
    });
  });

  it('lista justificativas com nomes de criador e aprovador', async () => {
    (prisma.rendimentoGapJustification.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'gap-1',
        userId: 'u1',
        dateRef: new Date('2026-06-02T00:00:00.000Z'),
        fromTime: new Date('1970-01-01T10:00:00.000Z'),
        toTime: new Date('1970-01-01T10:30:00.000Z'),
        gapType: 'idle',
        gapMinutes: 30,
        kind: 'ALERT',
        status: 'APPROVED',
        reason: 'Reunião',
        debitOvertime: false,
        overtimeMinutes: 0,
        createdBy: 'creator-id',
        createdAt: new Date('2026-06-02T14:00:00.000Z'),
        approvedBy: 'approver-id',
        approvedAt: new Date('2026-06-02T15:00:00.000Z'),
      },
    ]);
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: 'creator-id', name: 'Maria' },
      { id: 'approver-id', name: 'João' },
    ]);

    const rows = await service.listJustifications({
      userId: 'u1',
      start: new Date('2026-06-01T00:00:00.000Z'),
      end: new Date('2026-06-30T00:00:00.000Z'),
    });

    expect(rows[0]).toMatchObject({
      created_by: 'Maria',
      approved_by: 'João',
      gap_type: 'idle',
      from_time: '10:00',
      to_time: '10:30',
    });
  });
});
