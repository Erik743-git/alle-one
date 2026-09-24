import { Module } from '@nestjs/common';

import { MicrosoftGraphMailClient } from '../email-inbound/microsoft-graph-mail.client';
import { MailModule } from '../mail/mail.module';
import { ProjetosModule } from '../projetos/projetos.module';
import { TicketsModule } from '../tickets/tickets.module';
import { OportunidadesController } from './oportunidades.controller';
import { OportunidadesConversaoService } from './oportunidades-conversao.service';
import { OportunidadesEmailService } from './oportunidades-email.service';
import { OportunidadesJob } from './oportunidades.job';
import { OportunidadesService } from './oportunidades.service';

/** Quadro de oportunidades comerciais (docs/desenho/OPORTUNIDADES.md). */
@Module({
  imports: [MailModule, TicketsModule, ProjetosModule],
  controllers: [OportunidadesController],
  providers: [
    OportunidadesService,
    OportunidadesEmailService,
    OportunidadesConversaoService,
    OportunidadesJob,
    MicrosoftGraphMailClient,
  ],
  exports: [OportunidadesService],
})
export class OportunidadesModule {}
