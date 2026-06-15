import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppService.getIntegrationsHealth', () => {
  let service: AppService;
  const prisma = {
    $queryRaw: jest.fn(),
    portalTifluxOutbox: {
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AppService);
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
});
