import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { shouldRunScheduledJobs } from '../../common/scheduling/should-run-scheduled-jobs';
import { NpsService } from './nps.service';

/** Todo dia às 09:00 de Brasília (12:00 UTC): manda o NPS de quem está no prazo. */
@Injectable()
export class NpsJob {
  private readonly logger = new Logger(NpsJob.name);
  private rodando = false;

  constructor(private readonly nps: NpsService) {}

  @Cron('0 0 12 * * *')
  async enviar() {
    if (!shouldRunScheduledJobs() || this.rodando) return;
    this.rodando = true;
    try {
      await this.nps.enviarPendentes();
    } catch (err) {
      this.logger.error(
        `NPS: rotina de envio falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.rodando = false;
    }
  }
}
