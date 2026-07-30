import { Injectable, Logger } from '@nestjs/common';
import {
  PortalTicketAppointmentSyncStatus,
  PortalTifluxOutboxStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isTifluxDisconnected } from './tickets-portal.config';
import { TicketsOutboxService } from './tickets-outbox.service';

export type TicketReconcileIssueKind =
  | 'OUTBOX_FAILED'
  | 'OUTBOX_PENDING_STALE'
  | 'APPOINTMENT_PENDING_SYNC'
  | 'APPOINTMENT_MISSING_IN_TIFLUX';

export type TicketReconcileIssue = {
  kind: TicketReconcileIssueKind;
  ticketNumber: number | null;
  portalAppointmentId?: string;
  outboxId?: string;
  message: string;
  createdAt?: string;
};

export type TicketReconcileResult = {
  checkedAt: string;
  issues: TicketReconcileIssue[];
  summary: {
    total: number;
    outboxFailed: number;
    outboxPendingStale: number;
    appointmentPendingSync: number;
    appointmentMissingInTiflux: number;
  };
  retry?: {
    requeued: number;
    processed: number;
    synced: number;
    failed: number;
  };
};

@Injectable()
export class TicketsReconcileService {
  private readonly logger = new Logger(TicketsReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: TicketsOutboxService,
  ) {}

  async reconcile(options?: { autoRetry?: boolean }): Promise<TicketReconcileResult> {
    const pendingStaleMinutes = Number(
      process.env.TIFLUX_OUTBOX_PENDING_STALE_MINUTES ?? 30,
    );
    const staleBefore = new Date(Date.now() - pendingStaleMinutes * 60 * 1000);

    const issues: TicketReconcileIssue[] = [];

    const failedOutbox = await this.prisma.portalTifluxOutbox.findMany({
      where: { status: PortalTifluxOutboxStatus.FAILED },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        ticketNumber: true,
        kind: true,
        errorMessage: true,
        updatedAt: true,
      },
    });

    for (const row of failedOutbox) {
      issues.push({
        kind: 'OUTBOX_FAILED',
        ticketNumber: row.ticketNumber,
        outboxId: row.id,
        message: `${row.kind}: ${row.errorMessage ?? 'falha sem mensagem'}`,
        createdAt: row.updatedAt.toISOString(),
      });
    }

    const stalePending = await this.prisma.portalTifluxOutbox.findMany({
      where: {
        status: PortalTifluxOutboxStatus.PENDING,
        createdAt: { lt: staleBefore },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: {
        id: true,
        ticketNumber: true,
        kind: true,
        createdAt: true,
      },
    });

    for (const row of stalePending) {
      issues.push({
        kind: 'OUTBOX_PENDING_STALE',
        ticketNumber: row.ticketNumber,
        outboxId: row.id,
        message: `${row.kind} pendente há mais de ${pendingStaleMinutes} min`,
        createdAt: row.createdAt.toISOString(),
      });
    }

    const pendingAppointments = await this.prisma.portalTicketAppointment.findMany({
      where: {
        syncStatus: PortalTicketAppointmentSyncStatus.PENDING_TIFLUX,
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: {
        id: true,
        ticketNumber: true,
        createdAt: true,
      },
    });

    for (const row of pendingAppointments) {
      if (isTifluxDisconnected()) {
        // Portal-only: pending sync não é mais um problema operacional.
        continue;
      }
      issues.push({
        kind: 'APPOINTMENT_PENDING_SYNC',
        ticketNumber: row.ticketNumber,
        portalAppointmentId: row.id,
        message: 'Apontamento portal aguardando sincronização com TiFlux',
        createdAt: row.createdAt.toISOString(),
      });
    }

    const syncedWithId = await this.prisma.portalTicketAppointment.findMany({
      where: {
        syncStatus: PortalTicketAppointmentSyncStatus.SYNCED,
        tifluxAppointmentExternalId: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
      take: 300,
      select: {
        id: true,
        ticketNumber: true,
        tifluxAppointmentExternalId: true,
        updatedAt: true,
      },
    });

    if (syncedWithId.length > 0 && !isTifluxDisconnected()) {
      const pairs = syncedWithId
        .map((row) => ({
          portalId: row.id,
          ticketNumber: row.ticketNumber,
          externalId: row.tifluxAppointmentExternalId as number,
          updatedAt: row.updatedAt,
        }))
        .filter((row) => Number.isFinite(row.externalId) && row.externalId > 0);

      const missing = await this.findMissingTifluxAppointments(pairs);
      for (const row of missing) {
        issues.push({
          kind: 'APPOINTMENT_MISSING_IN_TIFLUX',
          ticketNumber: row.ticketNumber,
          portalAppointmentId: row.portalId,
          message: `Apontamento portal marcado SYNCED (id TiFlux ${row.externalId}) ausente em tiflux.ticket_appointments`,
          createdAt: row.updatedAt.toISOString(),
        });
      }
    }

    const summary = {
      total: issues.length,
      outboxFailed: issues.filter((i) => i.kind === 'OUTBOX_FAILED').length,
      outboxPendingStale: issues.filter((i) => i.kind === 'OUTBOX_PENDING_STALE')
        .length,
      appointmentPendingSync: issues.filter(
        (i) => i.kind === 'APPOINTMENT_PENDING_SYNC',
      ).length,
      appointmentMissingInTiflux: issues.filter(
        (i) => i.kind === 'APPOINTMENT_MISSING_IN_TIFLUX',
      ).length,
    };

    const result: TicketReconcileResult = {
      checkedAt: new Date().toISOString(),
      issues,
      summary,
    };

    if (options?.autoRetry && summary.outboxFailed > 0) {
      const requeued = await this.outbox.retryFailed(50);
      const batch = await this.outbox.processPendingBatch(50);
      result.retry = { requeued, ...batch };
      this.logger.log(
        `Reconcile autoRetry: requeued=${requeued} processed=${batch.processed}`,
      );
    }

    return result;
  }

  private async findMissingTifluxAppointments(
    pairs: Array<{
      portalId: string;
      ticketNumber: number;
      externalId: number;
      updatedAt: Date;
    }>,
  ): Promise<
    Array<{
      portalId: string;
      ticketNumber: number;
      externalId: number;
      updatedAt: Date;
    }>
  > {
    if (!pairs.length) return [];

    try {
      const ticketNumbers = [...new Set(pairs.map((p) => p.ticketNumber))];
      const externalIds = [...new Set(pairs.map((p) => p.externalId))];

      const rows = await this.prisma.$queryRaw<
        Array<{ ticket_number: number; external_id: number }>
      >`
        SELECT ticket_number, external_id
        FROM tiflux.ticket_appointments
        WHERE ticket_number = ANY(${ticketNumbers}::int[])
          AND external_id = ANY(${externalIds}::int[])
      `;

      const present = new Set(
        rows.map((r) => `${r.ticket_number}:${r.external_id}`),
      );

      return pairs.filter(
        (p) => !present.has(`${p.ticketNumber}:${p.externalId}`),
      );
    } catch (err) {
      this.logger.warn(
        `findMissingTifluxAppointments: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }
}
