import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { shouldRunScheduledJobs } from '../../common/scheduling/should-run-scheduled-jobs';
import { TicketAutomationService } from './ticket-automation.service';

@Injectable()
export class TicketAutomationIdleJob {
  private readonly logger = new Logger(TicketAutomationIdleJob.name);
  private running = false;

  constructor(private readonly automation: TicketAutomationService) {}

  /** A cada 5 minutos — tickets parados no estágio (TICKET_IDLE). */
  @Cron('0 */5 * * * *')
  async tick() {
    if (!shouldRunScheduledJobs()) return;
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.automation.processIdleRules(80);
      if (result.processed > 0 || result.errors > 0) {
        this.logger.log(
          `Automação idle: ${result.processed} ticket(s), ${result.errors} erro(s).`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Job de automação idle falhou: ${
          err instanceof Error ? err.message : err
        }`,
      );
    } finally {
      this.running = false;
    }
  }
}
