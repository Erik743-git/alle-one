import { Module } from '@nestjs/common';

import { MailModule } from '../mail/mail.module';
import { OportunidadesController } from './oportunidades.controller';
import { OportunidadesJob } from './oportunidades.job';
import { OportunidadesService } from './oportunidades.service';

/** Quadro de oportunidades comerciais (docs/desenho/OPORTUNIDADES.md). */
@Module({
  imports: [MailModule],
  controllers: [OportunidadesController],
  providers: [OportunidadesService, OportunidadesJob],
  exports: [OportunidadesService],
})
export class OportunidadesModule {}
