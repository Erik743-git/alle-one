import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { shouldRunScheduledJobs } from '../../common/scheduling/should-run-scheduled-jobs';
import { OportunidadesEmailService } from './oportunidades-email.service';
import { OportunidadesService } from './oportunidades.service';

@Injectable()
export class OportunidadesJob {
  private readonly logger = new Logger(OportunidadesJob.name);
  private rodando = false;
  private lendo = false;

  constructor(
    private readonly svc: OportunidadesService,
    private readonly email: OportunidadesEmailService,
  ) {}

  /** A cada minuto: lê a caixa de oportunidades (se estiver ligada). */
  @Cron('30 * * * * *')
  async lerCaixa() {
    if (!shouldRunScheduledJobs() || this.lendo) return;
    if (process.env.EMAIL_INBOUND_POLL_DISABLED === 'true') return;
    this.lendo = true;
    try {
      const r = await this.email.lerCaixa();
      if (r.criados || r.respostas) {
        this.logger.log(
          `Caixa de oportunidades: ${r.criados} card(s) novo(s), ${r.respostas} resposta(s).`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Leitura da caixa de oportunidades falhou: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.lendo = false;
    }
  }

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
