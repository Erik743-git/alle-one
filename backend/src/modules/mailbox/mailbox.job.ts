import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MailboxService } from './mailbox.service';

@Injectable()
export class MailboxJob {
  private readonly logger = new Logger(MailboxJob.name);

  constructor(private readonly mailbox: MailboxService) {}

  /** Atualiza correio de todos os usuários internos (chamados, GMUD, rendimento). */
  @Cron('0 0 8 * * *')
  async runDailyRefresh(): Promise<void> {
    this.logger.log('Iniciando atualização diária do correio...');
    await this.mailbox.refreshAllActiveUsers();
    this.logger.log('Correio diário concluído.');
  }

  /** Dia 15: alertas de consumo de contrato para administradores. */
  @Cron('0 0 9 15 * *')
  async runMonthlyContractAlerts(): Promise<void> {
    this.logger.log('Verificação mensal de contratos (dia 15)...');
    await this.mailbox.refreshContractAlertsForAdmins();
    await this.mailbox.refreshAllActiveUsers();
    this.logger.log('Alertas de contrato e correio atualizados.');
  }
}
