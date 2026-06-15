import { Test, TestingModule } from '@nestjs/testing';
import {
  PortalTicketAppointmentSyncStatus,
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

  it('agrega divergências de outbox e apontamentos', async () => {
    prisma.portalTifluxOutbox.findMany
      .mockResolvedValueOnce([
        {
          id: 'ob-1',
          ticketNumber: 100,
          kind: PortalTifluxOutboxKind.CREATE_APPOINTMENT,
          errorMessage: 'timeout',
          updatedAt: new Date('2026-06-01T10:00:00Z'),
        },
      ])
      .mockResolvedValueOnce([]);

    prisma.portalTicketAppointment.findMany
      .mockResolvedValueOnce([
        {
          id: 'pa-1',
          ticketNumber: 100,
          createdAt: new Date('2026-06-01T09:00:00Z'),
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await service.reconcile();

    expect(result.summary.total).toBe(2);
    expect(result.summary.outboxFailed).toBe(1);
    expect(result.summary.appointmentPendingSync).toBe(1);
    expect(result.issues[0].kind).toBe('OUTBOX_FAILED');
    expect(result.issues[1].kind).toBe('APPOINTMENT_PENDING_SYNC');
  });

  it('detecta apontamento SYNCED ausente no tiflux', async () => {
    prisma.portalTifluxOutbox.findMany.mockResolvedValue([]);
    prisma.portalTicketAppointment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'pa-2',
          ticketNumber: 200,
          tifluxAppointmentExternalId: 55,
          updatedAt: new Date('2026-06-01T12:00:00Z'),
        },
      ]);

    prisma.$queryRaw.mockResolvedValue([]);

    const result = await service.reconcile();

    expect(result.summary.appointmentMissingInTiflux).toBe(1);
    expect(result.issues[0].kind).toBe('APPOINTMENT_MISSING_IN_TIFLUX');
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
