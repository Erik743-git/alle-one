import { Test, TestingModule } from '@nestjs/testing';
import {
  PortalTifluxOutboxKind,
  PortalTifluxOutboxStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TicketsOutboxService } from './tickets-outbox.service';
import { TicketsReconcileService } from './tickets-reconcile.service';

describe('TicketsReconcileService', () => {
  let service: TicketsReconcileService;
  const prisma = {
    portalTifluxOutbox: {
      findMany: jest.fn(),
    },
    portalTicketAppointment: {
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };
  const outbox = {
    retryFailed: jest.fn(),
    processPendingBatch: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.portalTifluxOutbox.findMany.mockResolvedValue([]);
    prisma.portalTicketAppointment.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsReconcileService,
        { provide: PrismaService, useValue: prisma },
        { provide: TicketsOutboxService, useValue: outbox },
      ],
    }).compile();

    service = module.get(TicketsReconcileService);
  });

  it('autoRetry reenfileira outbox FAILED', async () => {
    prisma.portalTifluxOutbox.findMany
      .mockResolvedValueOnce([
        {
          id: 'ob-f',
          ticketNumber: 1,
          kind: PortalTifluxOutboxKind.CREATE_APPOINTMENT,
          errorMessage: 'err',
          updatedAt: new Date(),
          status: PortalTifluxOutboxStatus.FAILED,
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.portalTicketAppointment.findMany.mockResolvedValue([]);
    outbox.retryFailed.mockResolvedValue(1);
    outbox.processPendingBatch.mockResolvedValue({
      processed: 1,
      synced: 1,
      failed: 0,
    });

    const result = await service.reconcile({ autoRetry: true });

    expect(outbox.retryFailed).toHaveBeenCalledWith(50);
    expect(result.retry?.requeued).toBe(1);
    expect(result.retry?.synced).toBe(1);
  });
});
