import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TicketsOutboxService } from '../modules/tickets/tickets-outbox.service';

/** Job dedicado ao processo PM2 `alleone-outbox` (sem TIFLUX_OUTBOX_DISABLED). */
@Injectable()
export class TicketsOutboxWorkerJob implements OnModuleInit {
  private readonly logger = new Logger(TicketsOutboxWorkerJob.name);
  private running = false;

  constructor(private readonly outbox: TicketsOutboxService) {}

  onModuleInit(): void {
    this.logger.log('Worker outbox TiFlux iniciado');
  }

  @Cron('0 * * * * *')
  async processPendingOutbox(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.outbox.processPendingBatch(15);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Falha no worker outbox: ${msg}`);
    } finally {
      this.running = false;
    }
  }
}
