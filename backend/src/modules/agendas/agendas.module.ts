import { Module } from '@nestjs/common';

import { EscalaController } from './escala.controller';
import { EscalaService } from './escala.service';

/** Agendas: Plantão (Outlook), Escala e, depois, Manutenção. */
@Module({
  controllers: [EscalaController],
  providers: [EscalaService],
})
export class AgendasModule {}
