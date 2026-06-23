import { Injectable, Logger } from '@nestjs/common';
import {
  PortalTicketAppointmentSyncStatus,
  PortalTifluxOutboxKind,
  PortalTifluxOutboxStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TifluxService } from '../tiflux/tiflux.service';
import { isTifluxAppointmentSyncEnabled } from './tiflux-appointment-sync.config';

type AppointmentOutboxPayload = {
  portalAppointmentId: string;
  date: string;
  init_time: string;
  end_time: string;
  description: string;
  serviceName?: string;
  attendance?: string;
};

@Injectable()
export class TicketsOutboxService {
  private readonly logger = new Logger(TicketsOutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tiflux: TifluxService,
  ) {}

  /** Processa fila portal → TiFlux (CREATE_APPOINTMENT com status PENDING). */
  async processPendingBatch(limit = 10): Promise<{
    processed: number;
    synced: number;
    failed: number;
    skipped: number;
  }> {
    if (!isTifluxAppointmentSyncEnabled()) {
      return { processed: 0, synced: 0, failed: 0, skipped: 0 };
    }

    const rows = await this.prisma.portalTifluxOutbox.findMany({
      where: {
        status: PortalTifluxOutboxStatus.PENDING,
        kind: PortalTifluxOutboxKind.CREATE_APPOINTMENT,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    let synced = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of rows) {
      const result = await this.processOne(row.id);
      if (result === 'synced') synced += 1;
      else if (result === 'skipped') skipped += 1;
      else failed += 1;
    }

    if (rows.length > 0) {
      this.logger.log(
        `Outbox: ${rows.length} processado(s) — ${synced} sync, ${failed} falha(s), ${skipped} pausado(s)`,
      );
    }

    return { processed: rows.length, synced, failed, skipped };
  }

  /** Reenfileira entradas FAILED para nova tentativa (admin). */
  async retryFailed(limit = 20): Promise<number> {
    if (!isTifluxAppointmentSyncEnabled()) {
      return 0;
    }

    const rows = await this.prisma.portalTifluxOutbox.findMany({
      where: {
        status: PortalTifluxOutboxStatus.FAILED,
        kind: PortalTifluxOutboxKind.CREATE_APPOINTMENT,
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
      select: { id: true },
    });

    if (!rows.length) return 0;

    await this.prisma.portalTifluxOutbox.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: {
        status: PortalTifluxOutboxStatus.PENDING,
        errorMessage: null,
      },
    });

    return rows.length;
  }

  private async processOne(
    outboxId: string,
  ): Promise<'synced' | 'failed' | 'skipped'> {
    const row = await this.prisma.portalTifluxOutbox.findUnique({
      where: { id: outboxId },
    });

    if (
      !row ||
      row.status !== PortalTifluxOutboxStatus.PENDING ||
      row.kind !== PortalTifluxOutboxKind.CREATE_APPOINTMENT ||
      !row.ticketNumber
    ) {
      return 'failed';
    }

    const payload = row.payload as AppointmentOutboxPayload;
    if (
      !payload?.date ||
      !payload?.init_time ||
      !payload?.end_time ||
      !payload?.description
    ) {
      await this.markFailed(outboxId, 'Payload de apontamento inválido.');
      return 'failed';
    }

    if (payload.portalAppointmentId) {
      const appointment = await this.prisma.portalTicketAppointment.findUnique({
        where: { id: payload.portalAppointmentId },
        select: { syncPausedAt: true },
      });
      if (appointment?.syncPausedAt) {
        return 'skipped';
      }
    }

    try {
      // Mesa AlleOne no TiFlux não possui valorização: enviamos só data/hora/descrição.
      const created = await this.tiflux.createTicketAppointment(row.ticketNumber, {
        date: payload.date,
        init_time: payload.init_time,
        end_time: payload.end_time,
        description: payload.description,
      });

      const tifluxId = Number(created?.id);
      if (!Number.isFinite(tifluxId) || tifluxId <= 0) {
        throw new Error('TiFlux não retornou ID do apontamento.');
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.portalTifluxOutbox.update({
          where: { id: outboxId },
          data: {
            status: PortalTifluxOutboxStatus.SYNCED,
            tifluxExternalId: tifluxId,
            errorMessage: null,
            syncedAt: new Date(),
          },
        });

        if (payload.portalAppointmentId) {
          await tx.portalTicketAppointment.updateMany({
            where: { id: payload.portalAppointmentId },
            data: {
              syncStatus: PortalTicketAppointmentSyncStatus.SYNCED,
              tifluxAppointmentExternalId: tifluxId,
            },
          });
        }
      });

      return 'synced';
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao sincronizar com TiFlux.';
      await this.markFailed(outboxId, message.slice(0, 2000));
      this.logger.warn(`Outbox ${outboxId} falhou: ${message}`);
      return 'failed';
    }
  }

  private async markFailed(outboxId: string, errorMessage: string) {
    await this.prisma.portalTifluxOutbox.update({
      where: { id: outboxId },
      data: {
        status: PortalTifluxOutboxStatus.FAILED,
        errorMessage,
      },
    });
  }
}
