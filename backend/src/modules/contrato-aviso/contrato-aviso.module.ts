import { Module } from '@nestjs/common';

import { DashboardModule } from '../dashboard/dashboard.module';
import { MailModule } from '../mail/mail.module';
import { OportunidadesModule } from '../oportunidades/oportunidades.module';
import { ContratoAvisoJob } from './contrato-aviso.job';
import { ContratoAvisoService } from './contrato-aviso.service';

@Module({
  imports: [DashboardModule, MailModule, OportunidadesModule],
  providers: [ContratoAvisoService, ContratoAvisoJob],
  exports: [ContratoAvisoService],
})
export class ContratoAvisoModule {}
