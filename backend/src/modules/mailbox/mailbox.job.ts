import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { shouldRunScheduledJobs } from '../../common/scheduling/should-run-scheduled-jobs';
import { MailboxService } from './mailbox.service';

@Injectable()
export class MailboxJob {
  private readonly logger = new Logger(MailboxJob.name);

  constructor(private readonly mailbox: MailboxService) {}

  /** Atualiza correio de todos os usuários internos (chamados, GMUD, rendimento). */
  @Cron('0 0 8 * * *')
  async runDailyRefresh(): Promise<void> {
    if (!shouldRunScheduledJobs()) return;
    this.logger.log('Iniciando atualização diária do correio...');
    await this.mailbox.refreshAllActiveUsers();
    this.logger.log('Correio diário concluído.');
  }
}
