import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { shouldRunScheduledJobs } from '../../common/scheduling/should-run-scheduled-jobs';
import { OportunidadesService } from './oportunidades.service';

@Injectable()
export class OportunidadesJob {
  private readonly logger = new Logger(OportunidadesJob.name);
  private rodando = false;

  constructor(private readonly svc: OportunidadesService) {}

  /** De hora em hora: fecha aprovados/reprovados vencidos e manda os alertas. */
  @Cron('0 7 * * * *')
  async tick() {
    if (!shouldRunScheduledJobs() || this.rodando) return;
    this.rodando = true;
    try {
      const fechados = await this.svc.fecharVencidos();
      const alertas = await this.svc.alertarParados();
      const retornos = await this.svc.lembrarRetornos();
      if (fechados || alertas || retornos) {
        this.logger.log(
          `Oportunidades: ${fechados} fechada(s), ${alertas} alerta(s), ${retornos} lembrete(s) de retorno.`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Rotina de oportunidades falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.rodando = false;
    }
  }
}
