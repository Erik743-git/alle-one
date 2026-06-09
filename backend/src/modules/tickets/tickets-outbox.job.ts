import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TicketsOutboxService } from './tickets-outbox.service';

@Injectable()
export class TicketsOutboxJob {
  private readonly logger = new Logger(TicketsOutboxJob.name);
  private running = false;

  constructor(private readonly outbox: TicketsOutboxService) {}

  /** A cada minuto: envia apontamentos do portal para o TiFlux. */
  @Cron('0 * * * * *')
  async processPendingOutbox(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.outbox.processPendingBatch(15);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Falha no job de outbox: ${msg}`);
    } finally {
      this.running = false;
    }
  }
}
