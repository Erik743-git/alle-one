import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { shouldRunScheduledJobs } from '../../common/scheduling/should-run-scheduled-jobs';
import { ContratoAvisoService } from './contrato-aviso.service';

/** De hora em hora (minuto 20): confere o consumo dos contratos no mês. */
@Injectable()
export class ContratoAvisoJob {
  private readonly logger = new Logger(ContratoAvisoJob.name);
  private rodando = false;

  constructor(private readonly svc: ContratoAvisoService) {}

  @Cron('0 20 * * * *')
  async verificar() {
    if (!shouldRunScheduledJobs() || this.rodando) return;
    this.rodando = true;
    try {
      await this.svc.verificar();
    } catch (err) {
      this.logger.error(
        `Aviso de contrato falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.rodando = false;
    }
  }
}
