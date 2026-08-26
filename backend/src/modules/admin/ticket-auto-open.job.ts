import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { shouldRunScheduledJobs } from '../../common/scheduling/should-run-scheduled-jobs';
import { TicketAutoOpenService } from './ticket-auto-open.service';

@Injectable()
export class TicketAutoOpenJob {
  private readonly logger = new Logger(TicketAutoOpenJob.name);
  private running = false;

  constructor(private readonly service: TicketAutoOpenService) {}

  @Cron('0 * * * * *')
  async tick() {
    if (!shouldRunScheduledJobs()) return;
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.service.processDueRules(10);
      if (result.processed > 0 || result.errors > 0) {
        this.logger.log(
          `Abertura automática: ${result.processed} ticket(s), ${result.errors} erro(s).`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Job de abertura automática falhou: ${
          err instanceof Error ? err.message : err
        }`,
      );
    } finally {
      this.running = false;
    }
  }
}
