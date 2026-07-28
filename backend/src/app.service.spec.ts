import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppService.getIntegrationsHealth', () => {
  let service: AppService;
  const prisma = {
    $queryRaw: jest.fn(),
    portalTicket: {
      aggregate: jest.fn(),
    },
    portalTifluxOutbox: {
      count: jest.fn(),
    },
  };

  const prevCanonical = process.env.TICKETS_PORTAL_CANONICAL;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.TICKETS_PORTAL_CANONICAL = 'false';
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AppService);
  });

  afterAll(() => {
    if (prevCanonical === undefined) {
      delete process.env.TICKETS_PORTAL_CANONICAL;
    } else {
      process.env.TICKETS_PORTAL_CANONICAL = prevCanonical;
    }
  });

  it('marca sync como ok quando updated_at recente', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { max_updated: new Date(Date.now() - 60_000) },
    ]);
    prisma.portalTifluxOutbox.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0);

    const health = await service.getIntegrationsHealth();
    expect(health.tifluxSync.status).toBe('ok');
    expect(health.outbox.pending).toBe(2);
  });

  it('marca sync como unavailable quando schema tiflux falha', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('relation does not exist'));
    prisma.portalTifluxOutbox.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const health = await service.getIntegrationsHealth();
    expect(health.tifluxSync.status).toBe('unavailable');
  });

  it('usa frescor de portal_tickets quando canonical', async () => {
    process.env.TICKETS_PORTAL_CANONICAL = 'true';
    prisma.portalTicket.aggregate.mockResolvedValue({
      _max: {
        updatedAt: new Date(Date.now() - 60_000),
        updatedAtSource: new Date(Date.now() - 60_000),
      },
    });
    prisma.portalTifluxOutbox.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const health = await service.getIntegrationsHealth();
    expect(health.tifluxSync.status).toBe('ok');
    expect(health.tifluxSync.source).toBe('portal_tickets');
  });
});
