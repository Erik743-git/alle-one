import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { shouldRunScheduledJobs } from '../../common/scheduling/should-run-scheduled-jobs';
import { EmailInboundIngestService } from './email-inbound-ingest.service';

@Injectable()
export class EmailInboundPollJob {
  private readonly logger = new Logger(EmailInboundPollJob.name);
  private running = false;

  constructor(private readonly ingest: EmailInboundIngestService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handle() {
    if (!shouldRunScheduledJobs()) return;
    if (process.env.EMAIL_INBOUND_POLL_DISABLED === 'true') return;
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.ingest.pollMailbox();
      if (result.created > 0) {
        this.logger.log(
          `Poll e-mail: scanned=${result.scanned} created=${result.created}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Poll e-mail falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
